/**
 * Briefing Engine — generates daily/meeting briefs
 *
 * Powers "brief me on today", "summarize the standup", "who handles X"
 */

import { generateText } from '../ai-service';
import type { WorkspaceReader } from './workspace-reader';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3100';
const COMPANY_ID = process.env.COMPANY_ID || 'default';

/**
 * Brief the user on what happened today.
 * Queries Moltbook for recent knowledge entries and asks AI to summarize.
 */
export async function briefToday(
  userName: string,
  workspaceReader: WorkspaceReader
): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  // Query Moltbook for today's knowledge
  const results = await searchMoltbook(`meeting summary today ${today}`);

  if (!results || results.length === 0) {
    return `I don't have any recorded activity for today yet. As meetings are processed and team context is uploaded, I'll be able to give you a full briefing.`;
  }

  const contextBlock = results
    .map((r: any) => `- [${r.actionType || 'info'}] ${r.solution || r.situation}`)
    .join('\n');

  const rosterContext = workspaceReader.buildRosterContext();

  return generateText(
    `Summarize what happened today for ${userName}. Be concise, use bullet points. Here's what I know:\n\n${contextBlock}`,
    {
      systemPrompt: `You are Zinc Cat, a team briefing assistant. Summarize the day's activity clearly and concisely. Use Slack mrkdwn formatting (*bold* for emphasis, bullet points with •). Keep it under 300 words.\n\n${rosterContext}`,
      maxTokens: 512,
      enrichWithMoltbook: false, // We already have the data
    }
  );
}

/**
 * Brief the user on a specific meeting.
 * Searches Moltbook for meeting-related knowledge entries.
 */
export async function briefMeeting(
  meetingQuery: string,
  workspaceReader: WorkspaceReader
): Promise<string> {
  // Search for matching meeting data
  const results = await searchMoltbook(`meeting ${meetingQuery}`);

  if (!results || results.length === 0) {
    return `I don't have data for a meeting matching "${meetingQuery}". Make sure Zinc Cat's meeting bot was in the call — once the recording is processed, I'll be able to brief you.`;
  }

  // Separate by type
  const summaries = results.filter((r: any) => r.actionType === 'meeting_summary');
  const actions = results.filter((r: any) => r.actionType === 'action_item');
  const topics = results.filter((r: any) => r.actionType === 'topic');

  const sections: string[] = [];

  if (summaries.length > 0) {
    sections.push(`*Summary*\n${summaries.map((s: any) => s.solution).join('\n')}`);
  }

  if (actions.length > 0) {
    sections.push(`*Action Items*\n${actions.map((a: any) => `• ${a.solution}`).join('\n')}`);
  }

  if (topics.length > 0) {
    sections.push(`*Key Topics*\n${topics.map((t: any) => `• ${t.solution}`).join('\n')}`);
  }

  if (sections.length > 0) {
    return sections.join('\n\n');
  }

  // Fallback: ask AI to structure the raw data
  const rosterContext = workspaceReader.buildRosterContext();
  const contextBlock = results.map((r: any) => `- ${r.solution || r.situation}`).join('\n');

  return generateText(
    `Summarize this meeting data about "${meetingQuery}":\n\n${contextBlock}`,
    {
      systemPrompt: `You are Zinc Cat. Format the meeting brief with sections: Summary, Action Items, Key Topics. Use Slack mrkdwn (*bold* headers). Be concise.\n\n${rosterContext}`,
      maxTokens: 512,
      enrichWithMoltbook: false,
    }
  );
}

/**
 * Answer "who handles X?" using Moltbook routing.
 */
export async function whoHandles(
  query: string,
  workspaceReader: WorkspaceReader
): Promise<string> {
  try {
    const res = await fetch(`${HUB_URL}/api/routing/who-handles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: COMPANY_ID,
        keywords: query.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        actionType: 'general',
      }),
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data.user) {
        // Find their Slack ID for a proper mention
        const slackUser = workspaceReader.getAllUsers().find(
          u => u.moltbookUserId === data.user.id || u.email === data.user.email
        );
        const mention = slackUser ? `<@${slackUser.slackId}>` : data.user.name;
        const role = data.user.roles?.join(', ') || 'no specific role set';
        return `${mention} handles that. Their role: ${role}${data.confidence ? ` (confidence: ${Math.round(data.confidence * 100)}%)` : ''}`;
      }
    }
  } catch {
    // Fall through to AI-based answer
  }

  // Fallback: use AI with workspace roster knowledge
  const rosterContext = workspaceReader.buildRosterContext();
  return generateText(
    `Based on the team roster, who most likely handles "${query}"? If unsure, say so.`,
    {
      systemPrompt: `You are Zinc Cat. Answer who handles what based on team roles. Be concise. Use <@slackId> format if you know their Slack ID.\n\n${rosterContext}`,
      maxTokens: 256,
    }
  );
}

// ============================================
// HELPERS
// ============================================

async function searchMoltbook(keywords: string): Promise<any[]> {
  try {
    const res = await fetch(`${HUB_URL}/api/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: COMPANY_ID, keywords }),
    });
    if (res.ok) {
      return await res.json() as any[];
    }
  } catch {
    // Hub not reachable
  }
  return [];
}
