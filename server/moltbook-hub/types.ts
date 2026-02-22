/**
 * Moltbook Hub - Type Definitions
 *
 * THE HUB IS THE SHARED BRAIN.
 * Each company has their own Hub instance.
 */

// ============================================
// CORE TYPES
// ============================================

export interface Company {
  id: string;
  name: string;
  hubUrl: string;
  createdAt: number;
}

export interface User {
  id: string;
  companyId: string;
  email: string;
  name: string;
  roles: string[];
  responsibilities: string[];
  slackUserId?: string;
  isOnline: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface Agent {
  id: string;
  userId: string;
  companyId: string;
  isConnected: boolean;
  lastPing: number;
}

// ============================================
// KNOWLEDGE TYPES
// ============================================

/**
 * Knowledge entry - how an agent solved something
 */
export interface Knowledge {
  id: string;
  companyId: string;
  createdByUserId: string;

  // What situation this applies to
  situation: string;
  keywords: string[];
  actionType: string;

  // Category compartment (AI-assigned)
  categoryId?: string;

  // How it was solved
  solution: string;
  steps?: string[];

  // How well it works
  successCount: number;
  failureCount: number;
  lastUsedAt: number;

  createdAt: number;
}

/**
 * Routing rule - who handles what
 */
export interface RoutingRule {
  id: string;
  companyId: string;

  // Match criteria
  keywords: string[];
  actionTypes: string[];

  // Who handles it
  assignedUserId: string;
  assignedRole?: string;

  // Confidence from learning
  confidence: number;
  usageCount: number;

  createdAt: number;
  updatedAt: number;
}

// ============================================
// CATEGORY TYPES (Company compartments)
// ============================================

/**
 * Category — a compartment for organizing company knowledge.
 * AI auto-creates these based on what the company actually does
 * (e.g. "Pricing", "Products", "Factory Ops", "Customer Support").
 * Knowledge and context get filed into the right compartment.
 */
export interface Category {
  id: string;
  companyId: string;

  name: string;           // e.g. "Pricing", "Factory Operations"
  description: string;    // What kind of info goes here
  keywords: string[];     // Keywords that match this category
  parentId?: string;      // For sub-categories (nested compartments)

  itemCount: number;      // How many items filed here
  createdAt: number;
  updatedAt: number;
}

// ============================================
// MESSAGE TYPES
// ============================================

/**
 * Context uploaded from a user's local AI
 */
export interface ContextUpload {
  id: string;
  companyId: string;
  fromUserId: string;

  // Extracted info (NOT raw screenshot)
  people: string[];
  actionType: string;
  keywords: string[];
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';

  // Category compartment (AI-assigned)
  categoryId?: string;

  // Where to route
  targetUserId?: string;  // If known

  timestamp: number;
}

/**
 * Suggestion sent to a user
 */
export interface Suggestion {
  id: string;
  companyId: string;

  // Source
  fromContextId: string;
  fromUserId: string;

  // Target
  toUserId: string;

  // Content
  shortText: string;    // "Anna needs help booking..."
  fullText: string;     // Full context
  actionType: string;

  // Actions
  primaryAction: string;
  secondaryActions: string[];

  // State
  status: 'pending' | 'shown' | 'accepted' | 'rejected' | 'expired';

  createdAt: number;
  expiresAt: number;
}

/**
 * Outcome of a suggestion - for learning
 */
export interface Outcome {
  id: string;
  suggestionId: string;
  companyId: string;
  userId: string;

  // What happened
  action: 'accepted' | 'rejected' | 'edited' | 'ignored';
  wasSuccessful?: boolean;

  // For learning
  editedText?: string;
  feedback?: string;

  timestamp: number;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface RegisterUserRequest {
  email: string;
  name: string;
  roles: string[];
  responsibilities: string[];
}

export interface LoginRequest {
  email: string;
  companyId: string;
}

export interface UploadContextRequest {
  people: string[];
  actionType: string;
  keywords: string[];
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecordOutcomeRequest {
  suggestionId: string;
  action: 'accepted' | 'rejected' | 'edited' | 'ignored';
  wasSuccessful?: boolean;
  editedText?: string;
  feedback?: string;
}

export interface ShareKnowledgeRequest {
  situation: string;
  keywords: string[];
  actionType: string;
  solution: string;
  steps?: string[];
}

export interface QueryRequest {
  question: string;
  context?: string;
}

// ============================================
// WEBSOCKET MESSAGE TYPES
// ============================================

export type WSMessageType =
  | 'suggestion'
  | 'suggestion_update'
  | 'knowledge_update'
  | 'user_online'
  | 'user_offline'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: number;
}
