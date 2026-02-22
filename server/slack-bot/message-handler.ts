/**
 * Message Handler — handles DMs and @mentions
 *
 * Routes incoming Slack messages to the right handler:
 * - Briefing requests → briefing engine
 * - Routing questions → Moltbook routing API
 * - General questions → AI with Moltbook knowledge enrichment
 */

import { generateText } from '../ai-service';
import { briefToday, briefMeeting, whoHandles } from './briefing';
import type { WorkspaceReader } from './workspace-reader';

// Per-user conversation history (in-memory, capped)
const MAX_HISTORY = 20;
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// Intent detection patterns
const BRIEFING_PATTERNS = [
  /\bbrief\s*(me|us)?\b/i,
  /\bwhat\s+happened\s+(today|this\s+morning|yesterday|this\s+week)\b/i,
  /\bsummar(ize|y)\b/i,
  /\brecap\b/i,
  /\bmeeting\s+(summary|brief|recap|notes)\b/i,
];

const ROUTING_PATTERNS = [
  /\bwho\s+(handles?|is\s+responsible|works?\s+on|owns?|manages?|deals?\s+with)\b/i,
  /\bwho\s+should\s+I\s+(talk|speak|ask|reach\s+out)\b/i,
];

const MEETING_PATTERNS = [
  /\b(standup|stand-up|sync|retro|retrospective|sprint|planning|demo|kickoff|kick-off|1-on-1|one-on-one|all-hands|all\s+hands|town\s+hall)\b/i,
];

type MessageIntent = 'brief_today' | 'brief_meeting' | 'who_handles' | 'general';

function detectIntent(text: string): { intent: MessageIntent; query: string } {
  const lower = text.toLowerCase().trim();

  // Check for routing questions first (most specific)
  for (const pattern of ROUTING_PATTERNS) {
    if (pattern.test(lower)) {
      // Extract what they're asking about
      const query = lower
        .replace(pattern, '')
        .replace(/\?/g, '')
        .trim();
      return { intent: 'who_handles', query: query || lower };
    }
  }

  // Check for briefing requests
  for (const pattern of BRIEFING_PATTERNS) {
    if (pattern.test(lower)) {
      // Check if it's about a specific meeting
      for (const meetingPattern of MEETING_PATTERNS) {
        const match = lower.match(meetingPattern);
        if (match) {
          return { intent: 'brief_meeting', query: match[0] };
        }
      }

      // Check for "today/this morning" → daily brief
      if (/\b(today|this\s+morning|yesterday|this\s+week)\b/i.test(lower)) {
        return { intent: 'brief_today', query: lower };
      }

      // Check if they mention a specific meeting name after "summarize"
      const afterSummarize = lower.replace(/^.*?(summar(ize|y)|brief|recap)\s*/i, '').trim();
      if (afterSummarize.length > 2) {
        return { intent: 'brief_meeting', query: afterSummarize };
      }

      return { intent: 'brief_today', query: lower };
    }
  }

  return { intent: 'general', query: text };
}

/**
 * Handle an incoming Slack message (DM or @mention).
 */
export async function handleMessage(
  text: string,
  slackUserId: string,
  workspaceReader: WorkspaceReader,
  options: { isThread?: boolean } = {}
): Promise<string> {
  // Strip bot mention from text (e.g., "<@U123ABC> summarize the standup")
  const botId = workspaceReader.getBotUserId();
  const cleanText = botId
    ? text.replace(new RegExp(`<@${botId}>\\s*`, 'g'), '').trim()
    : text.trim();

  if (!cleanText) {
    return "Hey! Ask me anything — I can brief you on meetings, tell you who handles what, or answer questions about the team.";
  }

  const { intent, query } = detectIntent(cleanText);
  const user = workspaceReader.getUser(slackUserId);
  const userName = user?.name || 'there';

  switch (intent) {
    case 'brief_today':
      return briefToday(userName, workspaceReader);

    case 'brief_meeting':
      return briefMeeting(query, workspaceReader);

    case 'who_handles':
      return whoHandles(query, workspaceReader);

    case 'general':
      return handleGeneralChat(cleanText, slackUserId, userName, workspaceReader);
  }
}

/**
 * General AI chat with conversation history and Moltbook enrichment.
 */
async function handleGeneralChat(
  text: string,
  slackUserId: string,
  userName: string,
  workspaceReader: WorkspaceReader
): Promise<string> {
  // Get or create conversation history
  if (!conversationHistory.has(slackUserId)) {
    conversationHistory.set(slackUserId, []);
  }
  const history = conversationHistory.get(slackUserId)!;

  // Add user message to history
  history.push({ role: 'user', content: text });

  // Cap history
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  // Build system prompt with workspace context
  const rosterContext = workspaceReader.buildRosterContext();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `You are Zinc Cat, an AI assistant that lives in a Slack workspace. You help team members with information about meetings, team roles, and company knowledge.

Current date: ${dateStr}
You're talking to: ${userName}

${rosterContext}

Guidelines:
- Be concise and helpful
- Use Slack mrkdwn formatting (*bold*, _italic_, bullet points, \`code\`)
- If you don't know something, say so honestly
- When mentioning team members, use their name (not @mentions unless you have their Slack ID)
- Keep responses under 300 words unless the user asks for detail`;

  try {
    const response = await generateText(text, {
      systemPrompt,
      messages: history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      maxTokens: 512,
      enrichWithMoltbook: true,
    });

    // Add assistant response to history
    history.push({ role: 'assistant', content: response });

    return response;
  } catch (err: any) {
    console.error('AI generation failed:', err.message);
    return `Sorry, I hit an error: ${err.message}. Check that your AI provider is configured in the .env file.`;
  }
}
