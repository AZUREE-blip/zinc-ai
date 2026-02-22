/**
 * Workspace Reader — reads Slack users, channels, and roles into Moltbook
 *
 * On startup and every 30 minutes, syncs the Slack workspace into the
 * Moltbook Hub so the bot "knows every role in the Slack".
 */

import type { WebClient } from '@slack/web-api';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3100';
const COMPANY_ID = process.env.COMPANY_ID || 'default';

export interface SlackUserInfo {
  slackId: string;
  name: string;
  title: string;
  email: string;
  moltbookUserId?: string;
}

export class WorkspaceReader {
  private client: WebClient;
  private users = new Map<string, SlackUserInfo>();
  private channels: Array<{ id: string; name: string; purpose: string; topic: string }> = [];
  private botUserId: string | null = null;

  constructor(client: WebClient) {
    this.client = client;
  }

  /**
   * Sync workspace data from Slack → Moltbook Hub.
   * Called on startup and periodically.
   */
  async sync(): Promise<void> {
    console.log('Syncing Slack workspace...');

    // Ensure company exists in Hub
    await this.ensureCompany();

    await Promise.all([
      this.syncUsers(),
      this.syncChannels(),
    ]);

    console.log(`Workspace sync complete: ${this.users.size} users, ${this.channels.length} channels`);
  }

  getUser(slackId: string): SlackUserInfo | undefined {
    return this.users.get(slackId);
  }

  getAllUsers(): SlackUserInfo[] {
    return Array.from(this.users.values());
  }

  getChannels() {
    return this.channels;
  }

  getBotUserId(): string | null {
    return this.botUserId;
  }

  /**
   * Build a concise roster string for AI system prompts.
   */
  buildRosterContext(): string {
    const lines = this.getAllUsers().map(u => {
      const role = u.title || 'No title set';
      return `- ${u.name} (${role})`;
    });
    return `## Team Roster (${lines.length} people)\n${lines.join('\n')}`;
  }

  // ============================================
  // PRIVATE
  // ============================================

  private async ensureCompany(): Promise<void> {
    try {
      await fetch(`${HUB_URL}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: 'Default Company' }),
      });
    } catch {
      // Hub might not be running yet — that's ok
    }
  }

  private async syncUsers(): Promise<void> {
    try {
      // Get the bot's own user ID
      const authTest = await this.client.auth.test();
      this.botUserId = authTest.user_id as string;

      // Paginate through all workspace members
      let cursor: string | undefined;
      do {
        const result = await this.client.users.list({ cursor, limit: 200 });

        for (const member of result.members || []) {
          // Skip bots, deleted users, and Slackbot
          if (member.is_bot || member.deleted || member.id === 'USLACKBOT') continue;

          const profile = member.profile || {};
          const name = profile.real_name || member.real_name || member.name || 'Unknown';
          const title = profile.title || '';
          const email = profile.email || `${member.id}@slack.local`;

          const info: SlackUserInfo = {
            slackId: member.id!,
            name,
            title,
            email,
          };

          this.users.set(member.id!, info);

          // Upsert into Moltbook Hub
          try {
            const res = await fetch(`${HUB_URL}/api/users/upsert`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: COMPANY_ID,
                email,
                name,
                roles: title ? [title] : [],
                responsibilities: [],
                slackUserId: member.id,
              }),
            });

            if (res.ok) {
              const data = await res.json() as { id: string };
              info.moltbookUserId = data.id;
            }
          } catch {
            // Non-fatal — continue syncing other users
          }
        }

        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (err: any) {
      console.error('Failed to sync Slack users:', err.message);
    }
  }

  private async syncChannels(): Promise<void> {
    try {
      let cursor: string | undefined;
      this.channels = [];

      do {
        const result = await this.client.conversations.list({
          types: 'public_channel',
          cursor,
          limit: 200,
          exclude_archived: true,
        });

        for (const channel of result.channels || []) {
          const name = channel.name || '';
          const purpose = (channel.purpose as any)?.value || '';
          const topic = (channel.topic as any)?.value || '';

          this.channels.push({ id: channel.id!, name, purpose, topic });

          // Store channel info as knowledge in Moltbook
          if (purpose || topic) {
            try {
              await fetch(`${HUB_URL}/api/knowledge/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  companyId: COMPANY_ID,
                  userId: 'system',
                  situation: `Slack channel #${name}`,
                  keywords: ['channel', name, ...name.split('-')],
                  actionType: 'channel_info',
                  solution: `#${name}: ${purpose || topic}`,
                }),
              });
            } catch {
              // Non-fatal
            }
          }
        }

        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (err: any) {
      console.error('Failed to sync Slack channels:', err.message);
    }
  }
}
