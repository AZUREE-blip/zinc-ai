/**
 * Screen Watcher — Active window monitoring + context analysis
 *
 * Handles:
 * - Active window polling (active-win)
 * - Window context parsing (Slack, Outlook, Teams, Chrome, etc.)
 * - Observation text generation ("Watching Slack #general")
 * - Context analysis (suggest actions based on what user is doing)
 * - Alternative message generation
 */

const { ipcMain } = require('electron');
const privacyFilter = require('./privacy-filter.cjs');
const { getPrivacyConfig } = require('./privacy-config.cjs');

// --- State ---
let contextMonitorInterval = null;
let lastNonOverlayWindow = null; // Tracks last focused window that isn't Zinc.ai (for ghost typing)
let lastObservationText = '';

// Duplicate context cooldown
const recentContexts = new Map();
const CONTEXT_COOLDOWN_MS = 30000;

// Moltbook upload cooldown — don't evaluate the same context twice
const recentMoltbookContexts = new Map();
const MOLTBOOK_COOLDOWN_MS = 60000; // 1 minute between evaluations of same context

// --- Dependencies (set by init) ---
let getOverlayWindow = () => null;
let aiEngine = null;
let moltbookBridge = null;

// ============================================
// WINDOW CONTEXT PARSING
// ============================================

function parseWindowCtx(ctx) {
  const result = { app: (ctx.appName || '').toLowerCase() };
  const title = ctx.windowTitle || '';

  // Slack: "channel-name - Slack" or "Person Name - Slack"
  if (result.app.includes('slack')) {
    const match = title.match(/^(.+?)\s*[-–]\s*Slack/i);
    if (match) {
      const name = match[1].trim();
      if (name.startsWith('#')) {
        result.channel = name;
      } else {
        result.person = name;
      }
    }
  }

  // Outlook: "Subject - Person - Outlook"
  if (result.app.includes('outlook')) {
    const parts = title.split(/\s*[-–]\s*/);
    if (parts.length >= 2) {
      result.subject = parts[0];
      if (parts.length >= 3) result.person = parts[1];
    }
  }

  // Chrome/Edge
  if (result.app.includes('chrome') || result.app.includes('edge')) {
    const match = title.match(/^(.+?)\s*[-–]\s*(Google Chrome|Microsoft Edge)/i);
    if (match) result.subject = match[1].trim();
  }

  // Teams: "Person Name | Microsoft Teams"
  if (result.app.includes('teams')) {
    const match = title.match(/^(.+?)\s*\|\s*Microsoft Teams/i);
    if (match) result.person = match[1].trim();
  }

  return result;
}

// ============================================
// HELPERS
// ============================================

function generateCtxId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function truncateStr(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ============================================
// OBSERVATION TEXT GENERATION
// ============================================

/**
 * Generate human-readable observation text from window context.
 * This is the "thinking out loud" narration the overlay types out.
 */
function generateObservationText(ctx) {
  const parsed = parseWindowCtx(ctx);
  const title = (ctx.windowTitle || '').trim();
  const app = parsed.app;

  // Slack
  if (app.includes('slack')) {
    if (parsed.person) return `Watching chat with ${parsed.person} on Slack`;
    if (parsed.channel) return `Watching ${parsed.channel} on Slack`;
    return 'Watching Slack';
  }

  // Teams
  if (app.includes('teams')) {
    if (parsed.person) return `Watching conversation with ${parsed.person} on Teams`;
    if (title.toLowerCase().includes('meeting')) return 'Watching a Teams meeting';
    return 'Watching Microsoft Teams';
  }

  // Outlook / Mail
  if (app.includes('outlook') || app.includes('mail')) {
    if (parsed.person && parsed.subject) return `Reading email from ${parsed.person} about ${truncateStr(parsed.subject, 40)}`;
    if (parsed.subject) return `Reading email: ${truncateStr(parsed.subject, 45)}`;
    return 'Watching Outlook';
  }

  // Browser - GitHub, Figma, Notion, Google Docs, Linear, Jira, Confluence
  if ((app.includes('chrome') || app.includes('edge') || app.includes('firefox') || app.includes('brave')) && ctx.url) {
    const url = ctx.url;
    if (url.includes('github.com')) {
      const prMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
      if (prMatch) return `Watching PR #${prMatch[2]} on ${prMatch[1]}`;
      const issueMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
      if (issueMatch) return `Watching issue #${issueMatch[2]} on ${issueMatch[1]}`;
      const repoMatch = url.match(/github\.com\/([^/]+\/[^/]+)/);
      if (repoMatch) return `Browsing ${repoMatch[1]} on GitHub`;
      return 'Browsing GitHub';
    }
    if (url.includes('figma.com')) {
      return parsed.subject ? `Watching Figma design: ${truncateStr(parsed.subject, 40)}` : 'Watching Figma';
    }
    if (url.includes('notion.so') || url.includes('notion.site')) {
      return parsed.subject ? `Reading Notion page: ${truncateStr(parsed.subject, 40)}` : 'Browsing Notion';
    }
    if (url.includes('docs.google.com')) {
      return parsed.subject ? `Watching Google Doc: ${truncateStr(parsed.subject, 40)}` : 'Watching Google Docs';
    }
    if (url.includes('linear.app')) {
      return `Browsing Linear${parsed.subject ? ': ' + truncateStr(parsed.subject, 40) : ''}`;
    }
    if (url.includes('jira')) {
      return `Browsing Jira${parsed.subject ? ': ' + truncateStr(parsed.subject, 40) : ''}`;
    }
    if (url.includes('confluence')) {
      return `Reading Confluence${parsed.subject ? ': ' + truncateStr(parsed.subject, 40) : ''}`;
    }
    // Generic browser
    if (parsed.subject) return `Browsing: ${truncateStr(parsed.subject, 50)}`;
    return 'Browsing the web';
  }

  // VS Code / IDEs
  if (app.includes('code') || app.includes('visual studio') || app.includes('vscode')) {
    const vsMatch = title.match(/^(.+?)\s*[-–]\s*(.+?)\s*[-–]\s*Visual Studio Code/i);
    if (vsMatch) return `Watching you edit ${vsMatch[1].trim()} in ${vsMatch[2].trim()}`;
    return 'Watching you code in VS Code';
  }
  if (app.includes('intellij') || app.includes('webstorm') || app.includes('pycharm') || app.includes('rider')) {
    return `Watching you code in ${ctx.appName}`;
  }

  // Terminal
  if (app.includes('terminal') || app.includes('cmd') || app.includes('powershell') || app.includes('iterm') || app.includes('warp') || app.includes('windowsterminal') || app.includes('windows terminal')) {
    return 'Watching the terminal';
  }

  // Zoom / Google Meet
  if (app.includes('zoom')) return 'Watching a Zoom call';
  if (title.toLowerCase().includes('meet.google.com') || title.toLowerCase().includes('google meet')) return 'Watching a Google Meet';

  // Word / Excel / PowerPoint
  if (app.includes('winword') || app.includes('word')) {
    return parsed.subject ? `Watching Word doc: ${truncateStr(parsed.subject, 40)}` : 'Watching Microsoft Word';
  }
  if (app.includes('excel')) {
    return parsed.subject ? `Watching spreadsheet: ${truncateStr(parsed.subject, 40)}` : 'Watching Excel';
  }
  if (app.includes('powerpnt') || app.includes('powerpoint')) {
    return parsed.subject ? `Watching presentation: ${truncateStr(parsed.subject, 40)}` : 'Watching PowerPoint';
  }

  // Finder / Explorer
  if (app.includes('explorer') || app.includes('finder')) {
    return title ? `Browsing files: ${truncateStr(title, 45)}` : 'Browsing files';
  }

  // Fallback
  if (ctx.appName && ctx.appName !== 'Unknown') return `Watching ${ctx.appName}`;
  return 'Watching...';
}

// ============================================
// DEFAULT ALTERNATIVES (fallback when AI unavailable)
// ============================================

function getDefaultAlts(action) {
  const person = action.person || 'them';

  if (action.actionType === 'reply' || action.actionType === 'send_message') {
    return [
      { id: 1, title: 'Quick response', preview: 'Got it, thanks!', fullMessage: `Hey ${person},\n\nGot it, thanks for letting me know!\n\nBest,`, tone: 'casual' },
      { id: 2, title: 'Will follow up', preview: "I'll look into this", fullMessage: `Hi ${person},\n\nThanks for reaching out. I'll look into this and get back to you shortly.\n\nBest regards,`, tone: 'formal' },
      { id: 3, title: 'Need more info', preview: 'Can you clarify?', fullMessage: `Hey ${person},\n\nCould you provide a bit more context on this? Want to make sure I understand correctly.\n\nThanks!`, tone: 'friendly' },
      { id: 4, title: 'Delegate', preview: 'Looping in the right person', fullMessage: `Hi ${person},\n\nLet me loop in the right person who can help with this.\n\nBest,`, tone: 'direct' },
    ];
  }

  if (action.actionType === 'schedule_meeting') {
    return [
      { id: 1, title: 'This week', preview: 'Available Thursday', fullMessage: `Hi ${person},\n\nWould Thursday afternoon work for a quick sync?\n\nLet me know!`, tone: 'casual' },
      { id: 2, title: 'Next week', preview: 'Early next week', fullMessage: `Hi ${person},\n\nI have availability early next week. Would Monday or Tuesday work for you?\n\nBest regards,`, tone: 'formal' },
      { id: 3, title: 'Quick call', preview: '15 min sync', fullMessage: `Hey ${person},\n\nWant to do a quick 15-min call? I'm flexible on timing.\n\nLMK!`, tone: 'friendly' },
      { id: 4, title: 'Send availability', preview: 'Here are my open slots', fullMessage: `Hi ${person},\n\nHere's my availability:\n- [Date/Time 1]\n- [Date/Time 2]\n- [Date/Time 3]\n\nLet me know what works best.`, tone: 'direct' },
    ];
  }

  return [
    { id: 1, title: 'Acknowledge', preview: 'Got it!', fullMessage: 'Got it, thanks!', tone: 'casual' },
    { id: 2, title: 'Will handle', preview: "I'll take care of it", fullMessage: "Thanks for this. I'll take care of it.", tone: 'formal' },
    { id: 3, title: 'Question', preview: 'Quick question', fullMessage: 'Quick question about this - could you clarify?', tone: 'friendly' },
    { id: 4, title: 'Defer', preview: "I'll get back to you", fullMessage: "Let me look into this and I'll get back to you.", tone: 'direct' },
  ];
}

// ============================================
// IPC HANDLERS
// ============================================

function registerIpcHandlers() {
  // --- Window context ---
  ipcMain.handle('get-window-context', async () => {
    try {
      const activeWin = await import('active-win');
      const win = await activeWin.default();
      if (!win) return null;
      return {
        appName: win.owner?.name || 'Unknown',
        windowTitle: win.title || '',
        url: win.url,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to get window context:', error);
      return null;
    }
  });

  ipcMain.handle('get-observation-text', async () => {
    try {
      const activeWin = await import('active-win');
      const win = await activeWin.default();
      if (!win) return 'Watching...';
      return generateObservationText({
        appName: win.owner?.name || 'Unknown',
        windowTitle: win.title || '',
        url: win.url,
        timestamp: Date.now(),
      });
    } catch (error) {
      return 'Watching...';
    }
  });

  // --- Context monitoring ---
  ipcMain.handle('start-context-monitoring', async (event, intervalMs = 2000) => {
    if (contextMonitorInterval) clearInterval(contextMonitorInterval);

    contextMonitorInterval = setInterval(async () => {
      try {
        const activeWin = await import('active-win');
        const win = await activeWin.default();

        if (win) {
          // Track last non-Zinc.ai window for ghost typing
          const ownerName = (win.owner?.name || '').toLowerCase();
          const isOurWindow = ownerName.includes('zinc') || ownerName.includes('electron');
          if (!isOurWindow) {
            lastNonOverlayWindow = {
              owner: { name: win.owner?.name || 'Unknown', processId: win.owner?.processId },
              title: win.title || '',
            };
          }
        }

        const overlay = getOverlayWindow();
        if (win && overlay && !overlay.isDestroyed()) {
          const ctx = {
            appName: win.owner?.name || 'Unknown',
            windowTitle: win.title || '',
            url: win.url,
            timestamp: Date.now(),
          };

          // --- PRIVACY GATE 1: Work-Only Filter ---
          // Block non-work apps/URLs from being captured or shared
          const privacyConfig = getPrivacyConfig();
          const captureCheck = privacyFilter.shouldCaptureContext(ctx, privacyConfig);
          if (!captureCheck.allowed) {
            overlay.webContents.send('observation-text-changed', 'Taking a break...');
            return; // Skip entirely — no parsing, no upload, no data shared
          }

          const observationText = generateObservationText(ctx);
          const observationChanged = observationText !== lastObservationText;
          if (observationChanged) lastObservationText = observationText;

          overlay.webContents.send('window-context-changed', ctx);
          if (observationChanged) {
            overlay.webContents.send('observation-text-changed', observationText);

            // AI-gated upload: only send to Moltbook when AI finds genuinely useful info
            if (moltbookBridge && moltbookBridge.isConnected()) {
              evaluateAndUploadToMoltbook(ctx, observationText).catch(() => {});
            }
          }
        }
      } catch (error) {
        // Silently ignore - window might not be available
      }
    }, intervalMs);

    return { success: true };
  });

  ipcMain.handle('stop-context-monitoring', async () => {
    if (contextMonitorInterval) {
      clearInterval(contextMonitorInterval);
      contextMonitorInterval = null;
    }
    return { success: true };
  });

  // --- Context analysis (heuristic + AI enhancement) ---
  ipcMain.handle('analyze-context', async (event, ctx) => {
    const parsed = parseWindowCtx(ctx);
    const contextKey = `${parsed.app}:${parsed.person || parsed.channel || parsed.subject || ''}`;
    const lastSeen = recentContexts.get(contextKey);
    if (lastSeen && Date.now() - lastSeen < CONTEXT_COOLDOWN_MS) return null;

    let actionableItem = null;

    // Slack/Teams
    if (parsed.app.includes('slack') || parsed.app.includes('teams')) {
      if (parsed.person) {
        actionableItem = {
          id: generateCtxId(), suggestion: `Reply to ${parsed.person}?`,
          person: parsed.person, actionType: 'reply', context: ctx.windowTitle,
          confidence: 0.8, app: parsed.app,
        };
      } else if (parsed.channel) {
        actionableItem = {
          id: generateCtxId(), suggestion: `Send message to ${parsed.channel}?`,
          person: null, actionType: 'send_message', context: ctx.windowTitle,
          confidence: 0.6, app: parsed.app,
        };
      }
    }

    // Outlook
    if (parsed.app.includes('outlook')) {
      if (parsed.person && parsed.subject) {
        actionableItem = {
          id: generateCtxId(),
          suggestion: `Reply to ${parsed.person} about "${truncateStr(parsed.subject, 30)}"?`,
          person: parsed.person, actionType: 'reply',
          context: `${parsed.subject} from ${parsed.person}`,
          confidence: 0.85, app: 'outlook',
        };
      }
    }

    // Calendar
    if (parsed.app.includes('calendar') || (ctx.windowTitle || '').toLowerCase().includes('calendar')) {
      actionableItem = {
        id: generateCtxId(), suggestion: 'Schedule a meeting?',
        person: null, actionType: 'schedule_meeting', context: ctx.windowTitle,
        confidence: 0.7, app: parsed.app,
      };
    }

    // GitHub PR in browser
    if ((parsed.app.includes('chrome') || parsed.app.includes('edge') || parsed.app.includes('firefox')) && ctx.url) {
      const prMatch = ctx.url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
      if (prMatch) {
        actionableItem = {
          id: generateCtxId(), suggestion: `Review PR #${prMatch[2]} on ${prMatch[1]}?`,
          person: null, actionType: 'review', context: ctx.windowTitle,
          confidence: 0.75, app: 'github',
        };
      }
    }

    // Figma in browser
    if ((parsed.app.includes('chrome') || parsed.app.includes('edge') || parsed.app.includes('firefox')) && ctx.url && ctx.url.includes('figma.com')) {
      actionableItem = {
        id: generateCtxId(), suggestion: 'Share feedback on this Figma design?',
        person: null, actionType: 'review', context: ctx.windowTitle,
        confidence: 0.65, app: 'figma',
      };
    }

    // AI enhancement of suggestion
    if (actionableItem) {
      recentContexts.set(contextKey, Date.now());

      try {
        const config = aiEngine.getAiConfig();
        const hasCloudAI = (config.provider === 'anthropic' && config.anthropicApiKey) ||
                           (config.provider === 'openai' && config.openaiApiKey);
        const hasLocalAI = aiEngine.isAiReady() && aiEngine.getLlamaSequence();

        if (hasCloudAI || hasLocalAI) {
          const aiPrompt = `You're an AI assistant watching a user's desktop. Based on this context, write a SHORT (max 10 words) natural suggestion for what they might want to do.

App: ${ctx.appName}
Window: ${ctx.windowTitle}
${ctx.url ? `URL: ${ctx.url}` : ''}
${parsed.person ? `Person: ${parsed.person}` : ''}
${parsed.channel ? `Channel: ${parsed.channel}` : ''}
${parsed.subject ? `Subject: ${parsed.subject}` : ''}

Current basic suggestion: "${actionableItem.suggestion}"

Write a better, more specific suggestion. Just the suggestion text, nothing else. End with a question mark.`;

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 4000)
          );

          let enhanced;
          if (hasCloudAI) {
            enhanced = await Promise.race([
              aiEngine.generateWithCloudAI(aiPrompt, { temperature: 0.5, maxTokens: 50 }, config),
              timeoutPromise,
            ]);
          } else if (hasLocalAI) {
            const { LlamaChatSession } = await import('node-llama-cpp');
            const seq = aiEngine.getLlamaSequence();
            if (seq.nextTokenIndex > 0) {
              seq.eraseContextTokenRanges([{ start: 0, end: seq.nextTokenIndex }]);
            }
            const session = new LlamaChatSession({ contextSequence: seq });
            const resp = await Promise.race([
              session.prompt(aiPrompt, { maxTokens: 50, temperature: 0.5 }),
              timeoutPromise,
            ]);
            enhanced = { response: resp };
          }

          if (enhanced?.response) {
            const cleaned = enhanced.response.trim().replace(/^["']|["']$/g, '');
            if (cleaned.length > 5 && cleaned.length < 80 && cleaned.includes('?')) {
              actionableItem.suggestion = cleaned;
            }
          }
        }
      } catch (e) {
        // AI enhancement failed, keep basic suggestion
      }
    }

    return actionableItem;
  });

  // --- Generate alternatives ---
  ipcMain.handle('generate-alternatives', async (event, action) => {
    const altPrompt = `Generate 4 different message responses for this situation:

Action: ${action.actionType}
${action.person ? `Recipient: ${action.person}` : ''}
Context: ${action.context}

Create 4 alternatives with different tones:
1. Quick/casual response
2. Formal/professional response
3. Question/clarification
4. Delegate/defer response

Respond with JSON array:
[
  {"title": "Short title", "preview": "One line preview", "fullMessage": "Complete message", "tone": "casual"},
  {"title": "Short title", "preview": "One line preview", "fullMessage": "Complete message", "tone": "formal"},
  {"title": "Short title", "preview": "One line preview", "fullMessage": "Complete message", "tone": "friendly"},
  {"title": "Short title", "preview": "One line preview", "fullMessage": "Complete message", "tone": "direct"}
]

Only JSON, no other text.`;

    // Try local AI first
    if (aiEngine.isAiReady() && aiEngine.getLlamaSequence()) {
      try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        const seq = aiEngine.getLlamaSequence();
        seq.eraseContextTokenRanges([{ start: 0, end: seq.nextTokenIndex }]);
        const session = new LlamaChatSession({ contextSequence: seq });
        const response = await session.prompt(altPrompt, { temperature: 0.7, maxTokens: 1000 });
        session.dispose();
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.map((alt, i) => ({ ...alt, id: i + 1 }));
        }
      } catch (err) {
        console.error('Local AI alternatives failed:', err.message);
      }
    }

    // Try cloud AI
    const config = aiEngine.getAiConfig();
    const hasCloudAI = (config.provider === 'anthropic' && config.anthropicApiKey) ||
                       (config.provider === 'openai' && config.openaiApiKey);

    if (hasCloudAI) {
      try {
        const result = await aiEngine.generateWithCloudAI(altPrompt, { temperature: 0.7, maxTokens: 1000 }, config);
        if (result?.response) {
          const jsonMatch = result.response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.map((alt, i) => ({ ...alt, id: i + 1 }));
          }
        }
      } catch (err) {
        console.error('Cloud AI alternatives failed:', err.message);
      }
    }

    // Fallback: hardcoded defaults
    return getDefaultAlts(action);
  });
}

// ============================================
// AI-GATED MOLTBOOK UPLOAD
// Only uploads when AI determines the context is genuinely useful
// ============================================

/**
 * Evaluate whether the current screen context contains information
 * that's actually useful for the company/other users, and only then
 * upload structured data to Moltbook.
 *
 * This replaces the old "upload every 2 seconds" approach.
 */
async function evaluateAndUploadToMoltbook(ctx, observationText) {
  if (!aiEngine || !moltbookBridge) return;

  const parsed = parseWindowCtx(ctx);

  // Basic filter: skip if no identifiable person/channel/subject
  if (!parsed.person && !parsed.channel && !parsed.subject) return;

  // Cooldown: don't re-evaluate the same context within 1 minute
  const contextKey = `moltbook:${parsed.app}:${parsed.person || ''}:${parsed.channel || ''}:${parsed.subject || ''}`;
  const lastEval = recentMoltbookContexts.get(contextKey);
  if (lastEval && Date.now() - lastEval < MOLTBOOK_COOLDOWN_MS) return;
  recentMoltbookContexts.set(contextKey, Date.now());

  // Clean up old entries
  if (recentMoltbookContexts.size > 100) {
    const now = Date.now();
    for (const [key, ts] of recentMoltbookContexts) {
      if (now - ts > MOLTBOOK_COOLDOWN_MS * 2) recentMoltbookContexts.delete(key);
    }
  }

  try {
    const config = aiEngine.getAiConfig();
    const hasCloudAI = (config.provider === 'anthropic' && config.anthropicApiKey) ||
                       (config.provider === 'openai' && config.openaiApiKey);
    const hasLocalAI = aiEngine.isAiReady() && aiEngine.getLlamaSequence();

    if (!hasCloudAI && !hasLocalAI) return; // No AI available, skip

    const evalPrompt = `You are a workplace AI assistant. Analyze this screen context and decide if it contains information that would be GENUINELY USEFUL for other team members at this company.

Context:
- App: ${ctx.appName}
- Window: ${ctx.windowTitle}
${ctx.url ? `- URL: ${ctx.url}` : ''}
${parsed.person ? `- Person: ${parsed.person}` : ''}
${parsed.channel ? `- Channel: ${parsed.channel}` : ''}
${parsed.subject ? `- Subject: ${parsed.subject}` : ''}

ONLY mark as useful if this represents something actionable like:
- A request/task that needs routing to someone
- An important conversation someone else should know about
- A meeting, deadline, or decision others need to act on
- A support request or escalation
- A document review or approval needed

Do NOT mark as useful if the user is just:
- Browsing casually
- Reading without clear action needed
- In a general channel with no specific request
- Looking at their own personal content

Respond with ONLY valid JSON (no other text):
{"useful": true/false, "reason": "one sentence why", "people": ["names mentioned"], "actionType": "book_meeting|send_message|review_document|approve_request|schedule_task|follow_up|share_update|escalate|none", "keywords": ["key", "terms"], "summary": "one sentence summary of what's happening", "urgency": "low|medium|high|critical"}`;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 6000)
    );

    let result;
    if (hasCloudAI) {
      result = await Promise.race([
        aiEngine.generateWithCloudAI(evalPrompt, { temperature: 0.2, maxTokens: 200 }, config),
        timeoutPromise,
      ]);
    } else if (hasLocalAI) {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const seq = aiEngine.getLlamaSequence();
      if (seq.nextTokenIndex > 0) {
        seq.eraseContextTokenRanges([{ start: 0, end: seq.nextTokenIndex }]);
      }
      const session = new LlamaChatSession({ contextSequence: seq });
      const resp = await Promise.race([
        session.prompt(evalPrompt, { maxTokens: 200, temperature: 0.2 }),
        timeoutPromise,
      ]);
      result = { response: resp };
    }

    if (!result?.response) return;

    // Parse AI response
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const evaluation = JSON.parse(jsonMatch[0]);

    // Only upload if AI says it's useful
    if (!evaluation.useful || evaluation.actionType === 'none') return;

    console.log(`[Moltbook] AI found useful context: ${evaluation.summary}`);

    // --- PRIVACY GATE 2: PII Redaction ---
    // Redact sensitive data from AI-extracted fields before sending to hub
    const uploadData = {
      people: evaluation.people || [],
      actionType: evaluation.actionType || 'follow_up',
      keywords: (evaluation.keywords || []).map(k => privacyFilter.redactSensitiveData(k)),
      summary: privacyFilter.redactSensitiveData(evaluation.summary || observationText),
      urgency: evaluation.urgency || 'low',
    };

    // Upload redacted data to Moltbook
    await moltbookBridge.uploadContext(uploadData);
  } catch (e) {
    // AI evaluation failed — that's fine, just skip this upload
  }
}

// ============================================
// MODULE INIT
// ============================================

module.exports = function initScreenWatcher(deps) {
  getOverlayWindow = deps.getOverlayWindow;
  aiEngine = deps.aiEngine;
  moltbookBridge = deps.moltbookBridge || null;

  registerIpcHandlers();

  return {
    getLastNonOverlayWindow: () => lastNonOverlayWindow,
    parseWindowCtx,
    generateObservationText,
  };
};
