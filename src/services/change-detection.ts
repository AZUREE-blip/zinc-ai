/**
 * Change Detection Service
 * 
 * Handles both webhook-based and cursor-based polling for detecting changes
 * across integrated tools.
 * 
 * Principles:
 * - Only detects changes through authorized tool integrations
 * - Never monitors screens or captures screenshots
 * - Cursor-based detection must be idempotent, replayable, auditable
 */

import { ChangeEvent, SourceTool } from '../types/core';
import { Cursor, CursorPollResult, CursorAdvance } from '../types/cursors';
import { logger } from '../utils/logger';

export interface ChangeDetectionService {
  /**
   * Process incoming webhook payload
   * Verifies payload and returns raw change data for normalization
   */
  processWebhook(
    sourceTool: SourceTool,
    payload: unknown,
    signature?: string
  ): Promise<RawChangeData[]>;

  /**
   * Poll tool for changes using cursor-based detection
   * Returns raw changes to be normalized
   */
  pollWithCursor(cursor: Cursor): Promise<CursorPollResult>;

  /**
   * Advance cursor after successful normalization
   * Idempotent - safe to call multiple times with same parameters
   */
  advanceCursor(advance: CursorAdvance): Promise<void>;
}

/**
 * Raw change data from a tool before normalization
 * This is tool-specific and will be normalized into ChangeEvent
 */
export interface RawChangeData {
  tool: SourceTool;
  resourceId: string;
  resourceType: string;
  rawData: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Implementation of ChangeDetectionService
 */
export class ChangeDetectionServiceImpl implements ChangeDetectionService {
  constructor(
    private webhookVerifiers: Map<SourceTool, (payload: unknown, signature?: string) => Promise<boolean>>,
    private cursorPollers: Map<SourceTool, (cursor: Cursor) => Promise<CursorPollResult>>
  ) {}

  async processWebhook(
    sourceTool: SourceTool,
    payload: unknown,
    signature?: string
  ): Promise<RawChangeData[]> {
    const verifier = this.webhookVerifiers.get(sourceTool);
    if (!verifier) {
      throw new Error(`No webhook verifier configured for tool: ${sourceTool}`);
    }

    // Verify webhook signature
    const isValid = await verifier(payload, signature);
    if (!isValid) {
      logger.warn(`Invalid webhook signature for ${sourceTool}`, { payload, signature });
      throw new Error(`Invalid webhook signature for ${sourceTool}`);
    }

    // Extract raw changes from payload
    const rawChanges = await this.extractRawChanges(sourceTool, payload);
    
    logger.info(`Processed webhook from ${sourceTool}`, {
      sourceTool,
      changeCount: rawChanges.length,
    });

    return rawChanges;
  }

  async pollWithCursor(cursor: Cursor): Promise<CursorPollResult> {
    const poller = this.cursorPollers.get(cursor.sourceTool);
    if (!poller) {
      throw new Error(`No cursor poller configured for tool: ${cursor.sourceTool}`);
    }

    if (!cursor.isActive) {
      logger.warn(`Polling inactive cursor`, { cursorId: cursor.id, sourceTool: cursor.sourceTool });
      return {
        cursor,
        changes: [],
        hasMore: false,
      };
    }

    try {
      const result = await poller(cursor);
      
      logger.info(`Polled cursor for ${cursor.sourceTool}`, {
        cursorId: cursor.id,
        changeCount: result.changes.length,
        hasMore: result.hasMore,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error polling cursor`, {
        cursorId: cursor.id,
        sourceTool: cursor.sourceTool,
        error: errorMessage,
      });

      // Update cursor with error state
      const updatedCursor = {
        ...cursor,
        consecutiveErrors: cursor.consecutiveErrors + 1,
        lastError: errorMessage,
        lastErrorAt: new Date(),
        // Deactivate cursor if too many consecutive errors
        isActive: cursor.consecutiveErrors + 1 < 10,
      };

      return {
        cursor: updatedCursor,
        changes: [],
        hasMore: false,
      };
    }
  }

  async advanceCursor(advance: CursorAdvance): Promise<void> {
    // Implementation should:
    // 1. Load current cursor
    // 2. Verify cursor position hasn't advanced beyond this point (idempotency)
    // 3. Update cursor position atomically
    // 4. Log the advance for audit trail
    
    logger.info(`Advancing cursor`, {
      cursorId: advance.cursorId,
      newPosition: advance.newPosition,
      changeEventId: advance.changeEventId,
    });

    // TODO: Implement cursor persistence (database)
  }

  /**
   * Extract raw changes from webhook payload
   * Tool-specific logic
   */
  private async extractRawChanges(
    sourceTool: SourceTool,
    payload: unknown
  ): Promise<RawChangeData[]> {
    // Tool-specific extraction logic
    // This is a placeholder - each tool integration will implement its own extractor
    
    switch (sourceTool) {
      case 'github':
        return this.extractGithubWebhookChanges(payload);
      case 'notion':
        return this.extractNotionWebhookChanges(payload);
      case 'figma':
        return this.extractFigmaWebhookChanges(payload);
      default:
        logger.warn(`No webhook extractor for ${sourceTool}`, { payload });
        return [];
    }
  }

  private async extractGithubWebhookChanges(payload: unknown): Promise<RawChangeData[]> {
    // TODO: Implement GitHub webhook extraction
    // Extract: PR opened/updated/merged, commits, releases, etc.
    return [];
  }

  private async extractNotionWebhookChanges(payload: unknown): Promise<RawChangeData[]> {
    // TODO: Implement Notion webhook extraction
    return [];
  }

  private async extractFigmaWebhookChanges(payload: unknown): Promise<RawChangeData[]> {
    // TODO: Implement Figma webhook extraction
    return [];
  }
}
