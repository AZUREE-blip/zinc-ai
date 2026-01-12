/**
 * Role-Based Routing Engine
 * 
 * NON-NEGOTIABLE RULE: Notifications must ONLY be sent to people whose roles
 * are relevant to the information.
 * 
 * This service determines which channels should receive notifications for
 * each change event based on strict role relevance guardrails.
 */

import { ChangeEvent, Role, Channel, User, Notification } from '../types/core';
import { CodeChangeInterpretation } from '../types/code-changes';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export interface RoleBasedRoutingService {
  /**
   * Determine which channels should receive notifications for a change event
   * 
   * This enforces strict role relevance - if a role is not impacted,
   * they must NOT be notified.
   * 
   * Returns array of Notification objects in "pending" status, requiring approval.
   */
  routeChange(changeEvent: ChangeEvent, channels: Channel[]): Promise<Notification[]>;
}

/**
 * Implementation of RoleBasedRoutingService
 */
export class RoleBasedRoutingServiceImpl implements RoleBasedRoutingService {
  constructor(
    private aiInterpreter: (changeEvent: ChangeEvent) => Promise<{
      affectedRoles: Role[];
      summary: string;
      impact: string;
      relevance: Record<Role, string>;
      suggestedAction?: string;
    }>
  ) {}

  async routeChange(changeEvent: ChangeEvent, channels: Channel[]): Promise<Notification[]> {
    // Get AI interpretation of the change
    const interpretation = await this.aiInterpreter(changeEvent);

    // Extract affected roles from interpretation
    const affectedRoles = interpretation.affectedRoles || [];

    // Filter channels to only those relevant to affected roles
    const relevantChannels = this.filterRelevantChannels(channels, affectedRoles, changeEvent);

    // Generate notifications for each relevant channel
    const notifications: Notification[] = [];

    for (const channel of relevantChannels) {
      // Ensure channel role matches an affected role
      if (channel.type === 'role' && channel.role) {
        if (!affectedRoles.includes(channel.role)) {
          // STRICT GUARDRAIL: Do not notify if role is not affected
          logger.warn(`Skipping channel ${channel.name} - role ${channel.role} not affected`, {
            channelId: channel.id,
            changeEventId: changeEvent.id,
            affectedRoles,
          });
          continue;
        }

        const relevance = interpretation.relevance[channel.role] || 
          `Change affects ${channel.role} work`;

        notifications.push({
          id: randomUUID(),
          changeEventId: changeEvent.id,
          channelId: channel.id,
          role: channel.role,
          summary: interpretation.summary,
          impact: interpretation.impact,
          relevance,
          suggestedAction: interpretation.suggestedAction,
          status: 'pending',
          createdAt: new Date(),
        });
      } else if (channel.type === 'everyone') {
        // Company-wide channel - only use for major cross-cutting impacts
        if (this.isMajorCrossCuttingImpact(changeEvent, interpretation, affectedRoles)) {
          notifications.push({
            id: randomUUID(),
            changeEventId: changeEvent.id,
            channelId: channel.id,
            summary: interpretation.summary,
            impact: interpretation.impact,
            relevance: 'Major cross-cutting impact affecting multiple teams',
            suggestedAction: interpretation.suggestedAction,
            status: 'pending', // Requires approval for company-wide
            createdAt: new Date(),
          });
        } else {
          logger.info(`Skipping company-wide channel - not major cross-cutting impact`, {
            channelId: channel.id,
            changeEventId: changeEvent.id,
          });
        }
      }
    }

    logger.info(`Routed change event`, {
      changeEventId: changeEvent.id,
      notificationsCreated: notifications.length,
      affectedRoles,
      relevantChannels: relevantChannels.map(c => c.name),
    });

    return notifications;
  }

  /**
   * Filter channels to only those relevant to affected roles
   * Enforces strict role relevance guardrails
   */
  private filterRelevantChannels(
    channels: Channel[],
    affectedRoles: Role[],
    changeEvent: ChangeEvent
  ): Channel[] {
    const relevant: Channel[] = [];

    for (const channel of channels) {
      if (channel.type === 'role' && channel.role) {
        // Only include if role is in affected roles
        if (affectedRoles.includes(channel.role)) {
          relevant.push(channel);
        } else {
          // STRICT: Role channel must not receive unrelated notifications
          logger.debug(`Filtered out channel ${channel.name} - role not affected`, {
            channelId: channel.id,
            role: channel.role,
            affectedRoles,
          });
        }
      } else if (channel.type === 'everyone') {
        // Include for potential major impacts (will be filtered later)
        relevant.push(channel);
      }
    }

    return relevant;
  }

  /**
   * Determine if change is a major cross-cutting impact worthy of company-wide channel
   * 
   * Company-wide channel is reserved for:
   * - Breaking changes affecting multiple teams
   * - Major releases
   * - Critical infrastructure changes
   * - High-confidence, high-impact changes only
   */
  private isMajorCrossCuttingImpact(
    changeEvent: ChangeEvent,
    interpretation: {
      affectedRoles: Role[];
      summary: string;
      impact: string;
    },
    affectedRoles: Role[]
  ): boolean {
    // Must affect multiple roles (at least 3)
    if (affectedRoles.length < 3) {
      return false;
    }

    // Must be high confidence
    if (changeEvent.confidence && ['low', 'medium'].includes(changeEvent.confidence)) {
      return false;
    }

    // Must be breaking or major functional change
    if (changeEvent.classification === 'breaking') {
      return true;
    }

    // Must have high-impact indicators
    const impactIndicators = [
      'release',
      'breaking',
      'infrastructure',
      'security',
      'migration',
    ];

    const summaryLower = interpretation.summary.toLowerCase();
    const impactLower = interpretation.impact.toLowerCase();

    const hasHighImpactKeyword = impactIndicators.some(
      keyword => summaryLower.includes(keyword) || impactLower.includes(keyword)
    );

    return hasHighImpactKeyword;
  }
}

/**
 * Role relevance guardrails for code changes
 * 
 * These rules ensure that non-engineering roles only receive relevant summaries,
 * never raw diffs or internal implementation details.
 */
export class CodeChangeRoleGuardrails {
  /**
   * Determine what information to include for each role
   */
  static getRoleSpecificContent(
    role: Role,
    changeEvent: ChangeEvent,
    interpretation: CodeChangeInterpretation
  ): {
    includeDiffs: boolean;
    includeTechnicalDetails: boolean;
    includeRawData: boolean;
    summaryType: 'technical' | 'behavioral' | 'customer-facing';
  } {
    // Engineering roles get full technical details
    if (role.startsWith('engineering-')) {
      return {
        includeDiffs: true,
        includeTechnicalDetails: true,
        includeRawData: true,
        summaryType: 'technical',
      };
    }

    // Product/Design get behavioral summaries only
    if (role === 'product' || role === 'design') {
      return {
        includeDiffs: false,
        includeTechnicalDetails: false,
        includeRawData: false,
        summaryType: 'behavioral', // What behavior changed, not how
      };
    }

    // Sales/Marketing get customer-facing impact only
    if (role === 'sales' || role === 'marketing') {
      return {
        includeDiffs: false,
        includeTechnicalDetails: false,
        includeRawData: false,
        summaryType: 'customer-facing', // What customers see, not implementation
      };
    }

    // Default: minimal information
    return {
      includeDiffs: false,
      includeTechnicalDetails: false,
      includeRawData: false,
      summaryType: 'behavioral',
    };
  }

  /**
   * Check if role should receive code change notification
   * 
   * STRICT: If role is not in affectedRoles, return false
   */
  static shouldNotifyRole(
    role: Role,
    affectedRoles: Role[],
    interpretation: CodeChangeInterpretation
  ): boolean {
    // Must be in affected roles
    if (!affectedRoles.includes(role)) {
      return false;
    }

    // Additional checks based on role and change type
    if (role === 'sales' || role === 'marketing') {
      // Only notify sales/marketing if change has customer-facing impact
      const hasCustomerImpact = 
        interpretation.uiBehaviorChanges && interpretation.uiBehaviorChanges.length > 0;
      
      if (!hasCustomerImpact && interpretation.intent !== 'feature-addition') {
        return false;
      }
    }

    return true;
  }
}
