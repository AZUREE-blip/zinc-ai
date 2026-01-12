/**
 * Onboarding Service
 * 
 * Handles first-time user setup:
 * 1. Unique Identity (display name + tag)
 * 2. Role Selection
 * 3. Company Group (join or create)
 */

import { User, UserIdentity, CompanyGroup, Channel, Role } from '../types/core';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export interface OnboardingService {
  /**
   * Create user identity (display name + tag)
   */
  createIdentity(displayName: string, tag: string): Promise<UserIdentity>;

  /**
   * Select roles for user
   * User must have at least one role
   */
  selectRoles(identityId: string, roles: Role[]): Promise<void>;

  /**
   * Create a new company group
   */
  createCompanyGroup(name: string, createdBy: string): Promise<CompanyGroup>;

  /**
   * Join an existing company group
   */
  joinCompanyGroup(userId: string, groupSlug: string): Promise<void>;

  /**
   * Complete onboarding - creates user with identity, roles, and company group
   * Also creates default channels for the company group
   */
  completeOnboarding(data: {
    displayName: string;
    tag: string;
    roles: Role[];
    companyGroupName: string;
    isCreatingNewGroup: boolean;
    existingGroupSlug?: string;
  }): Promise<{
    user: User;
    companyGroup: CompanyGroup;
    channels: Channel[];
  }>;
}

/**
 * Implementation of OnboardingService
 */
export class OnboardingServiceImpl implements OnboardingService {
  private users: Map<string, User> = new Map();
  private identities: Map<string, UserIdentity> = new Map();
  private companyGroups: Map<string, CompanyGroup> = new Map();
  private channels: Map<string, Channel> = new Map();

  async createIdentity(displayName: string): Promise<UserIdentity> {
    // Generate unique hexadecimal tag
    let tag: string;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      // Generate short hexadecimal tag (5 characters: 0-9a-f)
      // Examples: 12525, a3f1c, fffff, 00001
      const hexValue = Math.floor(Math.random() * 0x100000); // 0 to 1048575
      tag = hexValue.toString(16).padStart(5, '0');
      
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique tag after multiple attempts');
      }
    } while (
      // Check if tag is already taken
      Array.from(this.identities.values()).some(i => i.tag === tag)
    );

    const identity: UserIdentity = {
      id: randomUUID(),
      displayName,
      tag,
      fullIdentifier: `${displayName}#${tag}`,
      createdAt: new Date(),
    };

    this.identities.set(identity.id, identity);

    logger.info(`Created user identity`, {
      identityId: identity.id,
      fullIdentifier: identity.fullIdentifier,
    });

    return identity;
  }

  async selectRoles(identityId: string, roles: Role[]): Promise<void> {
    if (roles.length === 0) {
      throw new Error('User must have at least one role');
    }

    const identity = this.identities.get(identityId);
    if (!identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    // Store roles with identity (in real implementation, would be in database)
    logger.info(`Selected roles for identity`, {
      identityId,
      roles,
    });
  }

  async createCompanyGroup(name: string, createdBy: string): Promise<CompanyGroup> {
    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug is taken
    const existingGroup = Array.from(this.companyGroups.values()).find(
      g => g.slug === slug
    );
    if (existingGroup) {
      throw new Error(`Company group with slug "${slug}" already exists`);
    }

    const group: CompanyGroup = {
      id: randomUUID(),
      name,
      slug,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.companyGroups.set(group.id, group);

    // Create default channels for the group
    await this.createDefaultChannels(group.id);

    logger.info(`Created company group`, {
      groupId: group.id,
      name: group.name,
      slug: group.slug,
      createdBy,
    });

    return group;
  }

  async joinCompanyGroup(userId: string, groupSlug: string): Promise<void> {
    const group = Array.from(this.companyGroups.values()).find(
      g => g.slug === groupSlug
    );
    if (!group) {
      throw new Error(`Company group not found: ${groupSlug}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Update user's company group
    const updatedUser: User = {
      ...user,
      companyGroupId: group.id,
    };
    this.users.set(userId, updatedUser);

    logger.info(`User joined company group`, {
      userId,
      groupId: group.id,
      groupSlug,
    });
  }

  async completeOnboarding(data: {
    displayName: string;
    roles: Role[];
    companyGroupName?: string;
    isCreatingNewGroup?: boolean;
    existingGroupSlug?: string;
  }): Promise<{
    user: User;
    companyGroup?: CompanyGroup;
    channels?: Channel[];
  }> {
    // 1. Create identity (tag is auto-generated)
    const identity = await this.createIdentity(data.displayName);

    // 2. Select roles
    await this.selectRoles(identity.id, data.roles);

    // 3. Create a default company group if none provided
    // (Company groups can be handled later in a separate flow)
    let companyGroup: CompanyGroup | undefined;
    let channels: Channel[] = [];
    
    if (data.isCreatingNewGroup && data.companyGroupName) {
      companyGroup = await this.createCompanyGroup(data.companyGroupName, identity.id);
      channels = Array.from(this.channels.values()).filter(
        c => c.companyGroupId === companyGroup!.id
      );
    } else if (data.existingGroupSlug) {
      const group = Array.from(this.companyGroups.values()).find(
        g => g.slug === data.existingGroupSlug
      );
      if (group) {
        companyGroup = group;
        channels = Array.from(this.channels.values()).filter(
          c => c.companyGroupId === companyGroup!.id
        );
      }
    }
    
    // If no company group, create a placeholder (user can join later)
    if (!companyGroup) {
      companyGroup = await this.createCompanyGroup(`${data.displayName}'s Group`, identity.id);
      channels = Array.from(this.channels.values()).filter(
        c => c.companyGroupId === companyGroup!.id
      );
    }

    // 4. Create user
    const user: User = {
      ...identity,
      roles: data.roles,
      companyGroupId: companyGroup.id,
    };
    this.users.set(user.id, user);

    logger.info(`Completed onboarding`, {
      userId: user.id,
      fullIdentifier: user.fullIdentifier,
      roles: user.roles,
      companyGroupId: companyGroup.id,
    });

    return {
      user,
      companyGroup,
      channels,
    };
  }

  /**
   * Create default channels for a company group
   * - Everyone channel (company-wide)
   * - Role-specific channels based on roles in the group
   */
  private async createDefaultChannels(companyGroupId: string): Promise<void> {
    // Create "everyone" channel
    const everyoneChannel: Channel = {
      id: randomUUID(),
      companyGroupId,
      type: 'everyone',
      name: 'everyone',
      description: 'Company-wide channel for major cross-cutting impacts',
      createdAt: new Date(),
    };
    this.channels.set(everyoneChannel.id, everyoneChannel);

    // Note: Role-specific channels are typically created on-demand
    // or when first user with that role joins
    // For now, we just create the everyone channel

    logger.info(`Created default channels for company group`, {
      companyGroupId,
    });
  }

  /**
   * Ensure role-specific channel exists for a role
   */
  async ensureRoleChannel(companyGroupId: string, role: Role): Promise<Channel> {
    const existing = Array.from(this.channels.values()).find(
      c => c.companyGroupId === companyGroupId && c.type === 'role' && c.role === role
    );

    if (existing) {
      return existing;
    }

    const channel: Channel = {
      id: randomUUID(),
      companyGroupId,
      type: 'role',
      name: role.replace('engineering-', 'engineering-').replace('-', ' '),
      role,
      description: `Channel for ${role} role notifications`,
      createdAt: new Date(),
    };

    this.channels.set(channel.id, channel);

    logger.info(`Created role channel`, {
      channelId: channel.id,
      companyGroupId,
      role,
    });

    return channel;
  }
}
