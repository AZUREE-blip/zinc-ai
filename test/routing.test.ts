/**
 * Test role-based routing logic
 * Verifies strict guardrails work correctly
 */

import { describe, it, expect } from 'vitest';
import { RoleBasedRoutingServiceImpl } from '../src/services/role-based-routing';
import { ChangeEvent, Channel, Role } from '../src/types/core';
import { randomUUID } from 'crypto';

describe('Role-Based Routing', () => {
  it('should NOT route to irrelevant role channels', async () => {
    const routing = new RoleBasedRoutingServiceImpl(async (changeEvent) => {
      // Simulate AI interpretation that says only engineering is affected
      return {
        affectedRoles: ['engineering-frontend'] as Role[],
        summary: 'Code change in frontend',
        impact: 'Affects frontend engineering',
        relevance: {
          'engineering-frontend': 'Code change affects frontend work',
        },
      };
    });

    const changeEvent: ChangeEvent = {
      id: randomUUID(),
      changedBy: 'alice',
      changedAt: new Date(),
      sourceTool: 'github',
      sourceResourceId: 'pr-123',
      sourceResourceType: 'pull_request',
      normalizedAt: new Date(),
      detectionMethod: 'webhook',
    };

    const channels: Channel[] = [
      {
        id: randomUUID(),
        companyGroupId: randomUUID(),
        type: 'role',
        name: 'engineering-frontend',
        role: 'engineering-frontend',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        companyGroupId: randomUUID(),
        type: 'role',
        name: 'sales',
        role: 'sales', // Should NOT receive notification
        createdAt: new Date(),
      },
    ];

    const notifications = await routing.routeChange(changeEvent, channels);

    // Should only create notification for engineering-frontend
    expect(notifications.length).toBe(1);
    expect(notifications[0].role).toBe('engineering-frontend');
    expect(notifications[0].channelId).toBe(channels[0].id);
  });

  it('should require high confidence for company-wide channel', async () => {
    const routing = new RoleBasedRoutingServiceImpl(async (changeEvent) => {
      return {
        affectedRoles: ['engineering-frontend', 'engineering-backend', 'product'] as Role[],
        summary: 'Minor UI update',
        impact: 'Small change',
        relevance: {},
      };
    });

    const changeEvent: ChangeEvent = {
      id: randomUUID(),
      changedBy: 'alice',
      changedAt: new Date(),
      sourceTool: 'github',
      sourceResourceId: 'pr-123',
      sourceResourceType: 'pull_request',
      confidence: 'medium', // Medium confidence - should NOT trigger company-wide
      normalizedAt: new Date(),
      detectionMethod: 'webhook',
    };

    const channels: Channel[] = [
      {
        id: randomUUID(),
        companyGroupId: randomUUID(),
        type: 'everyone',
        name: 'everyone',
        createdAt: new Date(),
      },
    ];

    const notifications = await routing.routeChange(changeEvent, channels);

    // Should NOT create company-wide notification due to medium confidence
    expect(notifications.length).toBe(0);
  });
});
