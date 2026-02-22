/**
 * Moltbook Hub - Main Server
 *
 * THE HUB IS THE SHARED BRAIN.
 * Each company runs their own Hub instance.
 *
 * Start with: npx ts-node server/moltbook-hub/index.ts
 * Or: npm run hub
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { MoltbookDB } from './db/schema';
import { registerAgentRoutes } from './api/agents';
import { registerKnowledgeRoutes } from './api/knowledge';
import { registerRoutingRoutes } from './api/routing';
import { registerOutcomeRoutes } from './api/outcomes';
import { registerWebExtractionRoutes } from './api/web-extraction';
import { registerCategoryRoutes } from './api/categories';
import type { WSMessage } from './types';

// Configuration
const PORT = parseInt(process.env.HUB_PORT || '3100', 10);
const HOST = process.env.HUB_HOST || '0.0.0.0';
const DB_PATH = process.env.HUB_DB_PATH || './moltbook.db';

// Initialize database
const db = new MoltbookDB(DB_PATH);

// Initialize Fastify
const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

// Track connected WebSocket clients
const connectedClients = new Map<string, WebSocket>();

async function start() {
  // Register plugins
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:*'];

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, server-to-server, same-origin)
      if (!origin) return cb(null, true);
      // Check against allowed origins
      const allowed = allowedOrigins.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(origin);
        }
        return origin === pattern;
      });
      cb(null, allowed);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  await app.register(websocket);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Company setup endpoint (first-time setup)
  app.post('/api/setup', async (request, reply) => {
    const { companyName } = request.body as { companyName: string };

    // Check if company already exists
    // For simplicity, we use a single company per Hub instance
    const existingCompany = db.getCompany('default');
    if (existingCompany) {
      return reply.send({
        companyId: existingCompany.id,
        companyName: existingCompany.name,
        message: 'Company already configured',
      });
    }

    // Create company
    const company = db.createCompany(companyName, `http://${HOST}:${PORT}`);

    return reply.status(201).send({
      companyId: company.id,
      companyName: company.name,
      message: 'Hub configured successfully',
    });
  });

  // Register API routes
  registerAgentRoutes(app, db);
  registerKnowledgeRoutes(app, db);
  registerRoutingRoutes(app, db);
  registerOutcomeRoutes(app, db);
  registerWebExtractionRoutes(app);
  registerCategoryRoutes(app, db);

  // WebSocket endpoint for real-time updates
  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, req) => {
      const clientId = req.headers['x-user-id'] as string || `anon-${Date.now()}`;

      console.log(`WebSocket connected: ${clientId}`);
      connectedClients.set(clientId, socket as unknown as WebSocket);

      // Handle incoming messages
      socket.on('message', (rawMessage: Buffer) => {
        try {
          const message = JSON.parse(rawMessage.toString()) as WSMessage;

          switch (message.type) {
            case 'ping':
              socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;

            default:
              console.log(`Unknown message type: ${message.type}`);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      // Handle disconnect
      socket.on('close', () => {
        console.log(`WebSocket disconnected: ${clientId}`);
        connectedClients.delete(clientId);

        // Mark user offline if this was an authenticated connection
        if (clientId && !clientId.startsWith('anon-')) {
          db.setUserOnline(clientId, false);
        }
      });

      // Send initial connection confirmation
      socket.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: Date.now(),
      }));
    });
  });

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🧠 MOLTBOOK HUB RUNNING                                  ║
║                                                            ║
║   API:       http://${HOST}:${PORT}                          ║
║   WebSocket: ws://${HOST}:${PORT}/ws                         ║
║   Database:  ${DB_PATH}                                     ║
║                                                            ║
║   THE HUB IS THE SHARED BRAIN.                             ║
║   Local AIs connect here to share knowledge.               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);

    // --- PRIVACY GATE 7: Data Retention Cleanup ---
    // Auto-delete expired data to prevent accumulation of sensitive context
    const RETENTION_CONFIG = {
      contextDays: 7,
      suggestionDays: 30,
      outcomeDays: 90,
    };
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Every hour

    // Run once at startup
    try {
      db.cleanupExpiredData(RETENTION_CONFIG);
      console.log('[PRIVACY] Initial data retention cleanup completed');
    } catch (err) {
      console.error('[PRIVACY] Initial cleanup failed:', err);
    }

    // Run hourly
    setInterval(() => {
      try {
        db.cleanupExpiredData(RETENTION_CONFIG);
        console.log('[PRIVACY] Hourly data retention cleanup completed');
      } catch (err) {
        console.error('[PRIVACY] Cleanup failed:', err);
      }
    }, CLEANUP_INTERVAL_MS);

  } catch (error) {
    console.error('Failed to start Hub:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down Hub...');
  db.close();
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down Hub...');
  db.close();
  await app.close();
  process.exit(0);
});

// Broadcast message to specific user
export function broadcastToUser(userId: string, message: WSMessage): void {
  const client = connectedClients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// --- PRIVACY GATE 6: Restrict broadcastToAll to system messages only ---
// Content messages (suggestions, knowledge) must NEVER be broadcast to all clients.
// Only system keepalive/status messages are allowed.
const ALLOWED_BROADCAST_TYPES = new Set(['pong', 'connected', 'user_online', 'user_offline']);

export function broadcastToAll(message: WSMessage): void {
  if (!ALLOWED_BROADCAST_TYPES.has(message.type)) {
    console.warn(`[PRIVACY] Blocked broadcast of '${message.type}' to all clients. Use broadcastToUser() for content messages.`);
    return;
  }
  for (const client of connectedClients.values()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

// Start the server
start();
