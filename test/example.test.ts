/**
 * Example test to verify core services work
 * Can be run on any OS (Windows, Linux, macOS)
 */

import { describe, it, expect } from 'vitest';
import { OnboardingServiceImpl } from '../src/services/onboarding';
import { Role } from '../src/types/core';
import { ChangeDetectionServiceImpl } from '../src/services/change-detection';
import { SourceTool } from '../src/types/core';

describe('Core Services', () => {
  it('should create user identity', async () => {
    const onboarding = new OnboardingServiceImpl();
    
    const identity = await onboarding.createIdentity('Test User', 'testuser');
    
    expect(identity.displayName).toBe('Test User');
    expect(identity.tag).toBe('testuser');
    expect(identity.fullIdentifier).toBe('Test User#testuser');
  });

  it('should complete onboarding', async () => {
    const onboarding = new OnboardingServiceImpl();
    
    const result = await onboarding.completeOnboarding({
      displayName: 'Alice',
      tag: 'alice',
      roles: ['engineering-frontend', 'design'] as Role[],
      companyGroupName: 'Test Company',
      isCreatingNewGroup: true,
    });

    expect(result.user.displayName).toBe('Alice');
    expect(result.user.roles).toContain('engineering-frontend');
    expect(result.companyGroup.name).toBe('Test Company');
    expect(result.channels.length).toBeGreaterThan(0);
  });

  it('should handle change detection service initialization', () => {
    const detection = new ChangeDetectionServiceImpl(
      new Map(),
      new Map()
    );

    expect(detection).toBeDefined();
  });
});
