/**
 * Development server for testing backend services
 * Can run on any OS - tests the core functionality without desktop app
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../src/utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { OnboardingServiceImpl } from '../src/services/onboarding';
import { OrchestrationServiceImpl } from '../src/services/orchestration';
import { ChangeDetectionServiceImpl } from '../src/services/change-detection';
import { ChangeNormalizationServiceImpl } from '../src/services/change-normalization';
import { AIInterpretationServiceImpl } from '../src/services/ai-interpretation';
import { RoleBasedRoutingServiceImpl } from '../src/services/role-based-routing';
import { NotificationServiceImpl } from '../src/services/notification';
import { Role } from '../src/types/core';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize services
const onboarding = new OnboardingServiceImpl();
const notification = new NotificationServiceImpl();
const aiInterpretation = new AIInterpretationServiceImpl();
const routing = new RoleBasedRoutingServiceImpl(
  (event) => aiInterpretation.interpretChangeEvent(event)
);
const changeDetection = new ChangeDetectionServiceImpl(
  new Map(), // webhook verifiers
  new Map()  // cursor pollers
);
const normalization = new ChangeNormalizationServiceImpl(
  new Map() // tool normalizers
);

const orchestration = new OrchestrationServiceImpl(
  changeDetection,
  normalization,
  aiInterpretation,
  routing,
  notification,
  async (companyGroupId) => {
    // Mock channel provider - in real implementation, would query database
    return [];
  }
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', platform: process.platform });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve dashboard.html
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Onboarding endpoint
app.post('/api/onboarding/complete', async (req, res) => {
  try {
    const { displayName, roles } = req.body;
    
    // Validate required fields
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ 
        error: 'Display name is required' 
      });
    }
    
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ 
        error: 'At least one role is required' 
      });
    }
    
    const result = await onboarding.completeOnboarding({
      displayName: displayName.trim(),
      roles,
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Onboarding error', { error });
    res.status(400).json({ 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Webhook endpoint for testing
app.post('/api/webhooks/:tool', async (req, res) => {
  try {
    const { tool } = req.params;
    const notifications = await orchestration.processWebhook(
      tool,
      req.body,
      req.headers['x-signature'] as string
    );
    
    res.json({ 
      message: 'Webhook processed',
      notificationsCreated: notifications.length,
      notifications 
    });
  } catch (error) {
    logger.error('Webhook error', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Get or create channels for user roles
app.post('/api/channels/get-or-create', async (req, res) => {
  try {
    const { roles, companyGroupId } = req.body;
    
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ 
        error: 'Roles array is required' 
      });
    }

    // Get or create channels for each role
    const channels = [];
    
    // Always include "everyone" channel
    channels.push({
      id: 'channel-everyone',
      name: 'Everyone',
      description: 'Company-wide announcements and major updates',
      type: 'everyone',
    });

    // Create channels for each role
    for (const role of roles) {
      // Ensure role channel exists
      if (companyGroupId) {
        const channel = await onboarding.ensureRoleChannel(companyGroupId, role);
        channels.push({
          id: channel.id,
          name: formatChannelName(role),
          description: `Updates relevant to ${role}`,
          role: role,
          type: 'role',
        });
      } else {
        // Fallback if no company group
        channels.push({
          id: `channel-${role}`,
          name: formatChannelName(role),
          description: `Updates relevant to ${role}`,
          role: role,
          type: 'role',
        });
      }
    }

    res.json({ channels });
  } catch (error) {
    logger.error('Error getting/creating channels', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

function formatChannelName(role: Role | string): string {
  // Convert role value to readable name
  const roleStr = String(role);
  const parts = roleStr.split('-');
  
  // Handle special cases
  if (roleStr === 'ceo') return 'CEO';
  if (roleStr === 'cto') return 'CTO';
  if (roleStr === 'cfo') return 'CFO';
  if (roleStr === 'coo') return 'COO';
  
  // Handle VP roles
  if (roleStr.startsWith('vp-')) {
    const vpPart = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `VP ${vpPart}`;
  }
  
  // Handle engineering roles
  if (roleStr.startsWith('engineering-')) {
    const engType = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `${engType} Engineering`;
  }
  
  // Handle other roles
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Get pending notifications
app.get('/api/notifications/pending', async (req, res) => {
  try {
    const notifications = await notification.getPendingNotifications(
      req.query.channelId as string
    );
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Approve notification
app.post('/api/notifications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;
    
    await notification.approveNotification(id, approvedBy);
    res.json({ message: 'Notification approved' });
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

app.listen(port, () => {
  logger.info(`Development server running on http://localhost:${port}`);
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Node version: ${process.version}`);
  logger.info('Endpoints:');
  logger.info(`  GET  /health`);
  logger.info(`  POST /api/onboarding/complete`);
  logger.info(`  POST /api/webhooks/:tool`);
  logger.info(`  GET  /api/notifications/pending`);
  logger.info(`  POST /api/notifications/:id/approve`);
});
