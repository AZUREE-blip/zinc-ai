/**
 * Moltbook Circuit - Core Types
 *
 * THE CIRCUIT IS THE PRODUCT.
 * All types here define the nervous system of AI Boss.
 */

// ============================================
// ENUMS - Used for structured routing (security)
// ============================================

export enum ActionType {
  BOOK_MEETING = 'book_meeting',
  SEND_MESSAGE = 'send_message',
  REVIEW_DOCUMENT = 'review_document',
  APPROVE_REQUEST = 'approve_request',
  SCHEDULE_TASK = 'schedule_task',
  FOLLOW_UP = 'follow_up',
  SHARE_UPDATE = 'share_update',
  ESCALATE = 'escalate',
  UNKNOWN = 'unknown',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ContextSource {
  SCREEN_CAPTURE = 'screen_capture',
  CLIPBOARD = 'clipboard',
  APP_EVENT = 'app_event',
  MANUAL_INPUT = 'manual_input',
}

export enum SuggestionStatus {
  PENDING = 'pending',
  SHOWN = 'shown',
  ACCEPTED = 'accepted',
  EDITED = 'edited',
  SKIPPED = 'skipped',
  EXPIRED = 'expired',
}

export enum OutcomeResult {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
  UNKNOWN = 'unknown',
}

// ============================================
// CORE INTERFACES
// ============================================

/**
 * A person mentioned in captured context
 */
export interface Person {
  name: string;
  email?: string;
  company?: string;
  role?: string;
}

/**
 * Extracted context from screen/input
 * This is the SANITIZED version - safe for AI processing
 */
export interface SafeContext {
  id: string;
  agentId: string;
  companyId: string;
  timestamp: number;

  // Structured data only - NO raw text
  source: ContextSource;
  people: Person[];
  actions: ActionType[];
  topics: string[];  // Sanitized keywords only
  urgency: UrgencyLevel;

  // Encrypted raw content (only target can decrypt)
  encryptedContent?: string;

  // Signature for integrity verification
  signature: string;
}

/**
 * A user's AI agent in the circuit
 */
export interface Agent {
  id: string;
  userId: string;
  companyId: string;

  // What this agent's user is responsible for
  responsibilities: ActionType[];
  roles: string[];

  // Current state
  isOnline: boolean;
  lastSeen: number;

  // Stats for learning
  suggestionsAccepted: number;
  suggestionsSkipped: number;
  averageResponseTime: number;
}

/**
 * A suggestion routed to a user
 */
export interface Suggestion {
  id: string;

  // Where it came from
  sourceAgentId: string;
  sourceContextId: string;

  // Where it's going
  targetAgentId: string;

  // The suggestion itself
  shortText: string;      // For collapsed pill: "Anna needs help booking..."
  fullText: string;       // For expanded: full context
  subtext?: string;       // Additional context: "She asked in Slack"

  // Actions available
  primaryAction: string;  // "Book it", "Send", "Approve"
  secondaryActions: string[];  // "Edit", "Skip"

  // Metadata
  urgency: UrgencyLevel;
  actionType: ActionType;
  createdAt: number;
  expiresAt: number;

  // State
  status: SuggestionStatus;

  // Routing confidence (for learning)
  routingConfidence: number;
}

/**
 * Outcome of a suggestion - used for learning
 */
export interface Outcome {
  id: string;
  suggestionId: string;
  agentId: string;

  // What the user did
  action: 'accepted' | 'edited' | 'skipped' | 'ignored';

  // If edited, what changed
  edits?: string;

  // Was the result successful?
  result: OutcomeResult;

  // How long it took to respond
  responseTimeMs: number;

  timestamp: number;
}

/**
 * Knowledge learned by an agent
 */
export interface Knowledge {
  id: string;
  agentId: string;

  // The pattern learned
  situation: string;      // "Meeting request from external contact"
  solution: string;       // "Use Calendly link from wiki"

  // When to apply
  triggerActions: ActionType[];
  triggerTopics: string[];

  // How well it worked
  successRate: number;
  usageCount: number;

  createdAt: number;
  lastUsedAt: number;
}

/**
 * Routing decision made by the circuit
 */
export interface RoutingDecision {
  id: string;
  contextId: string;

  // The decision
  targetAgentId: string;
  confidence: number;
  reason: string;

  // Factors that influenced decision
  matchedResponsibilities: ActionType[];
  matchedRoles: string[];

  timestamp: number;
}

// ============================================
// CIRCUIT API INTERFACES
// ============================================

/**
 * Context upload from client
 */
export interface ContextUploadRequest {
  agentId: string;
  context: SafeContext;
  authToken: string;
}

/**
 * Get suggestions for an agent
 */
export interface GetSuggestionsRequest {
  agentId: string;
  authToken: string;
}

/**
 * Record outcome of a suggestion
 */
export interface RecordOutcomeRequest {
  suggestionId: string;
  agentId: string;
  action: 'accepted' | 'edited' | 'skipped';
  edits?: string;
  result?: OutcomeResult;
  authToken: string;
}

/**
 * WebSocket message types
 */
export type WSMessageType =
  | 'new_suggestion'
  | 'suggestion_update'
  | 'suggestion_expired'
  | 'agent_online'
  | 'agent_offline'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: number;
}

// ============================================
// SECURITY INTERFACES
// ============================================

/**
 * Sanitized input - safe for AI processing
 */
export interface SanitizedInput {
  original: string;
  sanitized: string;
  removedPatterns: string[];
  riskScore: number;
}

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  timestamp: number;

  // Who
  agentId: string;
  companyId: string;

  // What
  action: string;
  resourceType: string;
  resourceId: string;

  // Details
  metadata: Record<string, unknown>;

  // Security
  ipAddress?: string;
  userAgent?: string;
}
