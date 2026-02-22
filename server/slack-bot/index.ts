/**
 * Zinc Cat — the Slack bot interface
 *
 * Users interact with Zinc Cat through DMs and @mentions
 * in Slack channels.
 *
 * Start with: npm run dev:bot
 * Requires: SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env
 */

import { App, LogLevel } from '@slack/bolt';
import { WorkspaceReader } from './workspace-reader';
import { handleMessage } from './message-handler';

// Bot avatar — used on every message via chat:write.customize scope
const ZINC_CAT_ICON = process.env.ZINC_CAT_ICON_URL || '';
const ZINC_CAT_NAME = 'Zinc Cat';

// Validate required env vars
if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Missing SLACK_BOT_TOKEN. See .env.example for setup instructions.');
  process.exit(1);
}
if (!process.env.SLACK_APP_TOKEN) {
  console.error('Missing SLACK_APP_TOKEN. Enable Socket Mode in your Slack app settings.');
  process.exit(1);
}

// Create Bolt app with Socket Mode (no public URL needed)
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: process.env.NODE_ENV === 'development' ? LogLevel.INFO : LogLevel.WARN,
});

const workspaceReader = new WorkspaceReader(app.client);

// ============================================
// DM HANDLER — direct messages to the bot
// ============================================

app.message(async ({ message, say }) => {
  // Only handle actual user messages (not bot messages, edits, etc.)
  if (message.subtype) return;
  if (!('text' in message) || !message.text) return;
  if (!('user' in message) || !message.user) return;

  // Check if this is a DM
  const isDM = message.channel_type === 'im';

  if (isDM) {
    try {
      const response = await handleMessage(
        message.text,
        message.user,
        workspaceReader
      );
      await say({
        text: response,
        ...(ZINC_CAT_ICON && { icon_url: ZINC_CAT_ICON, username: ZINC_CAT_NAME }),
      });
    } catch (err: any) {
      console.error('DM handler error:', err.message);
      await say({
        text: `Sorry, something went wrong. Error: ${err.message}`,
        ...(ZINC_CAT_ICON && { icon_url: ZINC_CAT_ICON, username: ZINC_CAT_NAME }),
      });
    }
  }
});

// ============================================
// @MENTION HANDLER — bot mentioned in channels
// ============================================

app.event('app_mention', async ({ event, say }) => {
  if (!event.text || !event.user) return;

  try {
    const response = await handleMessage(
      event.text,
      event.user,
      workspaceReader,
      { isThread: !!event.thread_ts }
    );

    // Reply in thread to avoid flooding the channel
    await say({
      text: response,
      thread_ts: event.thread_ts || event.ts,
      ...(ZINC_CAT_ICON && { icon_url: ZINC_CAT_ICON, username: ZINC_CAT_NAME }),
    });
  } catch (err: any) {
    console.error('@mention handler error:', err.message);
    await say({
      text: `Sorry, something went wrong. Error: ${err.message}`,
      thread_ts: event.thread_ts || event.ts,
      ...(ZINC_CAT_ICON && { icon_url: ZINC_CAT_ICON, username: ZINC_CAT_NAME }),
    });
  }
});

// ============================================
// STARTUP
// ============================================

(async () => {
  try {
    // Sync workspace data first
    await workspaceReader.sync();

    // Set up periodic re-sync (every 30 minutes)
    setInterval(() => {
      workspaceReader.sync().catch(err =>
        console.error('Workspace sync failed:', err.message)
      );
    }, 30 * 60 * 1000);

    // Start the bot
    await app.start();

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🐱 ZINC CAT SLACK BOT RUNNING                            ║
║                                                            ║
║   Mode:    Socket Mode                                     ║
║   Users:   ${String(workspaceReader.getAllUsers().length).padEnd(45)}║
║   Channels: ${String(workspaceReader.getChannels().length).padEnd(44)}║
║                                                            ║
║   DM the bot or @mention it in channels.                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (err: any) {
    console.error('Failed to start Slack bot:', err.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down Slack bot...');
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down Slack bot...');
  await app.stop();
  process.exit(0);
});
