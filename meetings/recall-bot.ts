/**
 * Recall.ai Bot Service
 *
 * Integrates with the Recall.ai API to deploy bots that join
 * meetings on Teams, Zoom, Google Meet as real participants.
 * The bot captures audio/video and sends data back for analysis.
 *
 * API docs: https://docs.recall.ai
 */

import type {
  RecallBot,
  RecallBotConfig,
  RecallBotService,
  RecallBotStatus,
  RecallPlatform,
  RecallRecording,
  RecallTranscript,
  RecallWebhookPayload,
  BotSession,
} from './types.js';

const RECALL_API_BASE = 'https://api.recall.ai/api/v1';

function detectPlatform(meetingUrl: string): RecallPlatform {
  const url = meetingUrl.toLowerCase();
  if (url.includes('zoom.us') || url.includes('zoom.com')) return 'zoom';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
  if (url.includes('meet.google.com')) return 'google_meet';
  if (url.includes('webex.com')) return 'webex';
  return 'other';
}

export class RecallBotServiceImpl implements RecallBotService {
  private apiKey: string = '';
  private activeBots: Map<string, BotSession> = new Map();
  private onStatusChange?: (botId: string, status: RecallBotStatus) => void;

  configure(apiKey: string, onStatusChange?: (botId: string, status: RecallBotStatus) => void): void {
    this.apiKey = apiKey;
    this.onStatusChange = onStatusChange;
  }

  async destroy(): Promise<void> {
    for (const [botId] of this.activeBots) {
      try {
        await this.stopBot(botId);
      } catch {
        // Best effort cleanup
      }
    }
    this.activeBots.clear();
  }

  private async apiCall<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Recall.ai API key not configured. Set RECALL_AI_API_KEY in .env or Settings.');
    }

    const headers: Record<string, string> = {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;

    const response = await fetch(`${RECALL_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Recall.ai API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  async createBot(config: RecallBotConfig): Promise<RecallBot> {
    const platform = detectPlatform(config.meetingUrl);

    const requestBody = {
      meeting_url: config.meetingUrl,
      bot_name: config.botName || 'Zinc Cat',
      join_at: config.joinAt || undefined,
      automatic_leave: config.automaticLeave ? {
        waiting_room_timeout: config.automaticLeave.waitingRoomTimeout ?? 300,
        no_one_joined_timeout: config.automaticLeave.noOneJoinedTimeout ?? 300,
        everyone_left_timeout: config.automaticLeave.everyoneLeftTimeout ?? 30,
      } : {
        waiting_room_timeout: 300,
        no_one_joined_timeout: 300,
        everyone_left_timeout: 30,
      },
      transcription_options: config.transcription ? {
        provider: config.transcription.provider || 'default',
      } : undefined,
    };

    const bot = await this.apiCall<RecallBot>('POST', '/bot', requestBody);

    const session: BotSession = {
      id: `session-${Date.now()}`,
      recallBotId: bot.id,
      meetingUrl: config.meetingUrl,
      platform,
      meetingTitle: undefined,
      status: bot.status || 'ready',
      participants: [],
      startedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.activeBots.set(bot.id, session);

    return bot;
  }

  async getBotStatus(botId: string): Promise<RecallBot> {
    const bot = await this.apiCall<RecallBot>('GET', `/bot/${botId}`);

    const session = this.activeBots.get(botId);
    if (session) {
      session.status = bot.status;
      session.participants = bot.meetingParticipants;
      if (bot.meetingMetadata?.title) {
        session.meetingTitle = bot.meetingMetadata.title;
      }
      session.updatedAt = Date.now();
    }

    return bot;
  }

  async stopBot(botId: string): Promise<void> {
    await this.apiCall<void>('POST', `/bot/${botId}/leave`);

    const session = this.activeBots.get(botId);
    if (session) {
      session.status = 'done';
      session.endedAt = Date.now();
      session.updatedAt = Date.now();
    }
  }

  async getRecording(botId: string): Promise<RecallRecording | null> {
    const bot = await this.getBotStatus(botId);
    return bot.recording || null;
  }

  async getTranscript(botId: string): Promise<RecallTranscript | null> {
    const bot = await this.getBotStatus(botId);
    return bot.transcript || null;
  }

  async downloadAudio(mediaUrl: string, savePath: string): Promise<string> {
    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;
    const fs = await import('fs');
    const { pipeline } = await import('stream/promises');

    const response = await fetch(mediaUrl, {
      headers: { 'Authorization': `Token ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    const fileStream = fs.createWriteStream(savePath);
    // @ts-ignore - node-fetch body is compatible with pipeline
    await pipeline(response.body!, fileStream);

    return savePath;
  }

  async listActiveBots(): Promise<RecallBot[]> {
    const response = await this.apiCall<{ results: RecallBot[] }>('GET', '/bot?status_ne=done&status_ne=fatal');
    return response.results || [];
  }

  async handleWebhook(payload: RecallWebhookPayload): Promise<void> {
    const { event, data } = payload;
    const session = this.activeBots.get(data.botId);

    switch (event) {
      case 'bot.status_change':
        if (session && data.status) {
          session.status = data.status;
          session.updatedAt = Date.now();
        }
        if (this.onStatusChange && data.status) {
          this.onStatusChange(data.botId, data.status);
        }
        break;

      case 'bot.participant_join':
        if (session && data.participant) {
          if (!session.participants) session.participants = [];
          session.participants.push(data.participant);
          session.updatedAt = Date.now();
        }
        break;

      case 'bot.participant_leave':
        if (session) {
          session.updatedAt = Date.now();
        }
        break;

      case 'bot.recording_ready':
        if (session && data.recording) {
          session.updatedAt = Date.now();
        }
        break;

      case 'bot.transcription':
        if (session && data.transcript) {
          if (!session.transcriptSegments) session.transcriptSegments = [];
          session.transcriptSegments.push(data.transcript);
          session.updatedAt = Date.now();
        }
        break;
    }
  }

  getSession(botId: string): BotSession | undefined {
    return this.activeBots.get(botId);
  }

  getAllSessions(): BotSession[] {
    return Array.from(this.activeBots.values());
  }
}
