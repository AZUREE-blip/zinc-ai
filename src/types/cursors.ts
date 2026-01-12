/**
 * Cursor-based change detection
 * 
 * Cursors enable idempotent, replayable, auditable change detection
 * for tools without reliable webhooks.
 */

import { z } from 'zod';
import { SourceToolSchema } from './core';

export type SourceTool = z.infer<typeof SourceToolSchema>;

/**
 * Cursor state for tracking "what changed since last check"
 * 
 * Cursor must be:
 * - Idempotent: Same cursor = same results
 * - Replayable: Can reprocess from any cursor state
 * - Auditable: Can trace all cursor advances
 * - Resilient: Outages don't lose cursor position
 */
export const CursorSchema = z.object({
  id: z.string().uuid(),
  companyGroupId: z.string().uuid(),
  sourceTool: SourceToolSchema,
  
  // Cursor position - tool-specific
  // Could be: timestamp, version ID, change token, sequence number, etc.
  position: z.string(), // Opaque string representing cursor position
  positionType: z.enum(['timestamp', 'version-id', 'change-token', 'sequence', 'other']),
  
  // Metadata for safety and audit
  lastPolledAt: z.date(),
  lastChangeDetectedAt: z.date().optional(),
  lastChangeEventId: z.string().uuid().optional(), // Most recent ChangeEvent processed
  
  // Error handling
  consecutiveErrors: z.number().int().min(0).default(0),
  lastError: z.string().optional(),
  lastErrorAt: z.date().optional(),
  
  // State management
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Cursor = z.infer<typeof CursorSchema>;

/**
 * Result from polling with a cursor
 */
export const CursorPollResultSchema = z.object({
  cursor: CursorSchema,
  changes: z.array(z.unknown()), // Raw changes from tool, to be normalized
  nextPosition: z.string().optional(), // New cursor position if any changes found
  hasMore: z.boolean(), // Whether there might be more changes to fetch
});

export type CursorPollResult = z.infer<typeof CursorPollResultSchema>;

/**
 * Cursor advance operation (after successful normalization)
 */
export const CursorAdvanceSchema = z.object({
  cursorId: z.string().uuid(),
  newPosition: z.string(),
  changeEventId: z.string().uuid(), // Most recent ChangeEvent that advanced cursor
  advancedAt: z.date(),
  advancedBy: z.string().uuid().optional(), // User/system that triggered advance
});

export type CursorAdvance = z.infer<typeof CursorAdvanceSchema>;
