/**
 * Core domain models for the Role-Aware Cross-Tool Change Synchronization Platform
 * 
 * These types enforce the non-negotiable principle: notifications must ONLY be sent
 * to people whose roles are relevant to the information.
 */

import { z } from 'zod';

/**
 * User identity with display name and unique tag
 * Example: "alex#frontend", "sam#sales"
 */
export const UserIdentitySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(100),
  tag: z.string().regex(/^[a-z0-9-]+$/, 'Tag must be lowercase alphanumeric with hyphens'),
  fullIdentifier: z.string(), // "displayName#tag"
  createdAt: z.date(),
});

export type UserIdentity = z.infer<typeof UserIdentitySchema>;

/**
 * Roles are foundational routing metadata, not cosmetic labels
 * Used to determine notification relevance
 */
export const RoleSchema = z.enum([
  // Engineering
  'engineering-frontend',
  'engineering-backend',
  'engineering-devops',
  'engineering-fullstack',
  'engineering-mobile',
  'engineering-qa',
  'engineering-security',
  'engineering-data',
  'engineering-infrastructure',
  // Design
  'design',
  'design-ui',
  'design-ux',
  'design-product',
  'design-visual',
  // Product
  'product',
  'product-manager',
  'product-strategy',
  'product-marketing',
  // Sales
  'sales',
  'sales-account-executive',
  'sales-development',
  'sales-customer-success',
  'sales-business-development',
  // Marketing
  'marketing',
  'marketing-growth',
  'marketing-content',
  'marketing-brand',
  'marketing-digital',
  'marketing-community',
  // Operations
  'operations',
  'operations-people',
  'operations-finance',
  'operations-legal',
  'operations-facilities',
  // Executive
  'ceo',
  'cto',
  'cfo',
  'coo',
  'vp-engineering',
  'vp-product',
  'vp-sales',
  'vp-marketing',
  'vp-growth',
  'vp-operations',
  'vp-people',
  'vp-finance',
  // Support
  'support',
  'support-customer',
  'support-technical',
  // Management
  'management',
  'management-director',
  'management-manager',
  'management-team-lead',
  // Other
  'consultant',
  'contractor',
  'intern',
  'founder',
  'advisor',
  'board-member',
  'other',
]);

export type Role = z.infer<typeof RoleSchema>;

/**
 * User with roles and company group membership
 */
export const UserSchema = UserIdentitySchema.extend({
  roles: z.array(RoleSchema).min(1, 'User must have at least one role'),
  companyGroupId: z.string().uuid(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Company group - all change interpretation and routing occurs within groups
 */
export const CompanyGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CompanyGroup = z.infer<typeof CompanyGroupSchema>;

/**
 * Channel types
 * - "everyone": Company-wide, reserved for major cross-cutting impacts
 * - "role": Role-specific channels (#engineering-frontend, #design, etc.)
 */
export const ChannelTypeSchema = z.enum(['everyone', 'role']);

export type ChannelType = z.infer<typeof ChannelTypeSchema>;

/**
 * Channel - receives notifications based on role relevance
 * Role channels must NEVER receive unrelated technical or business noise
 */
export const ChannelSchema = z.object({
  id: z.string().uuid(),
  companyGroupId: z.string().uuid(),
  type: ChannelTypeSchema,
  name: z.string(), // "everyone" or role name like "engineering-frontend"
  role: RoleSchema.optional(), // Required if type is "role"
  description: z.string().optional(),
  createdAt: z.date(),
});

export type Channel = z.infer<typeof ChannelSchema>;

/**
 * Source tool identifiers
 */
export const SourceToolSchema = z.enum([
  'github',
  'notion',
  'figma',
  'jira',
  'linear',
  'slack',
  'other',
]);

export type SourceTool = z.infer<typeof SourceToolSchema>;

/**
 * Change classification for semantic interpretation
 */
export const ChangeClassificationSchema = z.enum([
  'cosmetic',
  'functional',
  'breaking',
]);

export type ChangeClassification = z.infer<typeof ChangeClassificationSchema>;

/**
 * Change intent inference
 */
export const ChangeIntentSchema = z.enum([
  'bug-fix',
  'refactor',
  'feature-addition',
  'migration',
  'documentation',
  'other',
]);

export type ChangeIntent = z.infer<typeof ChangeIntentSchema>;

/**
 * Confidence level for AI interpretations
 * Must never hide uncertainty
 */
export const ConfidenceLevelSchema = z.enum([
  'low',      // < 50% - requires human review
  'medium',   // 50-80% - human review recommended
  'high',     // 80-95% - can proceed with approval
  'very-high', // > 95% - high confidence, still requires approval
]);

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * CANONICAL CHANGE EVENT
 * 
 * This is the single normalized format for all detected changes.
 * All AI interpretation and routing operates on this structure.
 */
export const ChangeEventSchema = z.object({
  id: z.string().uuid(),
  
  // Who changed what
  changedBy: z.string(), // User identifier from source tool
  changedAt: z.date(),
  
  // Where it happened
  sourceTool: SourceToolSchema,
  sourceResourceId: z.string(), // Tool-specific resource ID
  sourceResourceUrl: z.string().url().optional(),
  sourceResourceType: z.string(), // "pr", "page", "component", "issue", etc.
  
  // How it changed
  diff: z.string().optional(), // For text/code changes
  version: z.string().optional(), // Version ID or hash
  rawChangeData: z.record(z.unknown()).optional(), // Tool-specific raw data
  
  // Semantic interpretation (AI-generated)
  classification: ChangeClassificationSchema.optional(),
  intent: ChangeIntentSchema.optional(),
  confidence: ConfidenceLevelSchema.optional(),
  evidence: z.array(z.string()).optional(), // Citations for interpretation
  
  // Impact analysis
  impactedComponents: z.array(z.string()).optional(),
  affectedRoles: z.array(RoleSchema).optional(), // Roles that should be notified
  dependentTeams: z.array(z.string()).optional(),
  
  // Additional metadata
  tags: z.array(z.string()).optional(),
  relatedResources: z.array(z.object({
    tool: SourceToolSchema,
    resourceId: z.string(),
    resourceUrl: z.string().url().optional(),
  })).optional(),
  
  // Normalization metadata
  normalizedAt: z.date(),
  detectionMethod: z.enum(['webhook', 'cursor-polling']),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

/**
 * Notification that will be sent to a channel
 * Includes routing decision and explanation
 */
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  changeEventId: z.string().uuid(),
  channelId: z.string().uuid(),
  role: RoleSchema.optional(), // Which role this notification is for
  
  // Human-readable explanation
  summary: z.string(), // What changed
  impact: z.string(), // Why it matters
  relevance: z.string(), // Why this role/channel should see it
  suggestedAction: z.string().optional(), // What (if anything) should happen next
  
  // Status
  status: z.enum(['pending', 'approved', 'rejected', 'sent']),
  approvedBy: z.string().uuid().optional(),
  approvedAt: z.date().optional(),
  sentAt: z.date().optional(),
  
  createdAt: z.date(),
});

export type Notification = z.infer<typeof NotificationSchema>;
