/**
 * Orchestration Service
 * 
 * Main orchestrator that ties together all services:
 * 1. Change Detection (webhooks + cursors)
 * 2. Change Normalization
 * 3. AI Interpretation
 * 4. Role-Based Routing
 * 5. Notification Creation
 * 
 * This is the central service that processes change events end-to-end.
 */

import { ChangeEvent, Channel, Notification } from '../types/core';
import { ChangeDetectionService, RawChangeData } from './change-detection';
import { ChangeNormalizationService } from './change-normalization';
import { AIInterpretationService } from './ai-interpretation';
import { RoleBasedRoutingService } from './role-based-routing';
import { NotificationService } from './notification';
import { logger } from '../utils/logger';

export interface OrchestrationService {
  /**
   * Process incoming webhook
   * Full pipeline: detection -> normalization -> interpretation -> routing -> notification
   */
  processWebhook(
    sourceTool: string,
    payload: unknown,
    signature?: string
  ): Promise<Notification[]>;

  /**
   * Process cursor-based poll result
   * Full pipeline for each detected change
   */
  processPolledChanges(
    companyGroupId: string,
    rawChanges: RawChangeData[]
  ): Promise<Notification[]>;

  /**
   * Get all channels for a company group
   */
  getChannelsForGroup(companyGroupId: string): Promise<Channel[]>;
}

/**
 * Implementation of OrchestrationService
 */
export class OrchestrationServiceImpl implements OrchestrationService {
  constructor(
    private changeDetection: ChangeDetectionService,
    private normalization: ChangeNormalizationService,
    private aiInterpretation: AIInterpretationService,
    private routing: RoleBasedRoutingService,
    private notification: NotificationService,
    private channelProvider: (companyGroupId: string) => Promise<Channel[]>
  ) {}

  async processWebhook(
    sourceTool: string,
    payload: unknown,
    signature?: string
  ): Promise<Notification[]> {
    try {
      logger.info(`Processing webhook from ${sourceTool}`);

      // 1. Detect changes from webhook
      const rawChanges = await this.changeDetection.processWebhook(
        sourceTool as any,
        payload,
        signature
      );

      if (rawChanges.length === 0) {
        logger.info(`No changes detected from ${sourceTool} webhook`);
        return [];
      }

      // Extract company group ID from webhook payload
      // In real implementation, this would come from webhook configuration
      const companyGroupId = await this.extractCompanyGroupId(sourceTool, payload);
      if (!companyGroupId) {
        throw new Error(`Could not determine company group from ${sourceTool} webhook`);
      }

      // Process all detected changes
      return this.processRawChanges(companyGroupId, rawChanges);
    } catch (error) {
      logger.error(`Error processing webhook from ${sourceTool}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async processPolledChanges(
    companyGroupId: string,
    rawChanges: RawChangeData[]
  ): Promise<Notification[]> {
    if (rawChanges.length === 0) {
      return [];
    }

    logger.info(`Processing ${rawChanges.length} polled changes for company group ${companyGroupId}`);

    return this.processRawChanges(companyGroupId, rawChanges);
  }

  /**
   * Core processing pipeline for raw changes
   */
  private async processRawChanges(
    companyGroupId: string,
    rawChanges: RawChangeData[]
  ): Promise<Notification[]> {
    const allNotifications: Notification[] = [];

    // Get channels for company group
    const channels = await this.channelProvider(companyGroupId);

    // Process each raw change
    for (const rawChange of rawChanges) {
      try {
        // 1. Normalize change event
        const changeEvent = await this.normalization.normalize(rawChange);

        // 2. AI interpretation (adds semantic metadata)
        const interpretation = await this.aiInterpretation.interpretChangeEvent(changeEvent);

        // Enrich change event with interpretation
        const enrichedEvent: ChangeEvent = {
          ...changeEvent,
          classification: interpretation.classification,
          intent: interpretation.intent,
          confidence: interpretation.confidence,
          affectedRoles: interpretation.affectedRoles,
          evidence: interpretation.evidence,
        };

        // 3. Role-based routing (determines which channels should receive notification)
        const routedNotifications = await this.routing.routeChange(enrichedEvent, channels);

        // 4. Create notifications (all start in "pending" status)
        for (const routedNotification of routedNotifications) {
          const notification = await this.notification.createNotification({
            changeEventId: enrichedEvent.id,
            channelId: routedNotification.channelId,
            role: routedNotification.role,
            summary: routedNotification.summary,
            impact: routedNotification.impact,
            relevance: routedNotification.relevance,
            suggestedAction: routedNotification.suggestedAction,
            status: 'pending',
          });

          allNotifications.push(notification);
        }

        logger.info(`Processed change event`, {
          changeEventId: enrichedEvent.id,
          notificationsCreated: routedNotifications.length,
          affectedRoles: interpretation.affectedRoles,
        });
      } catch (error) {
        logger.error(`Error processing raw change`, {
          error: error instanceof Error ? error.message : String(error),
          rawChange,
        });
        // Continue processing other changes even if one fails
      }
    }

    return allNotifications;
  }

  async getChannelsForGroup(companyGroupId: string): Promise<Channel[]> {
    return this.channelProvider(companyGroupId);
  }

  /**
   * Extract company group ID from webhook payload
   * This is tool-specific and depends on webhook configuration
   */
  private async extractCompanyGroupId(
    sourceTool: string,
    payload: unknown
  ): Promise<string | null> {
    // TODO: Implement tool-specific extraction
    // This would typically come from:
    // - Webhook configuration mapping
    // - Repository/organization to company group mapping
    // - Payload metadata
    
    // Placeholder
    return null;
  }
}
