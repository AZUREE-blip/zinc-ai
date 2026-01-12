/**
 * Code change synchronization types
 * 
 * Specialized types for Git/code platform changes with semantic interpretation
 */

import { z } from 'zod';
import { RoleSchema, ChangeClassificationSchema, ChangeIntentSchema, ConfidenceLevelSchema } from './core';

export type Role = z.infer<typeof RoleSchema>;
export type ChangeClassification = z.infer<typeof ChangeClassificationSchema>;
export type ChangeIntent = z.infer<typeof ChangeIntentSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Git platform types (GitHub, GitLab, etc.)
 */
export const GitPlatformSchema = z.enum(['github', 'gitlab', 'bitbucket', 'other']);

export type GitPlatform = z.infer<typeof GitPlatformSchema>;

/**
 * Pull Request/Merge Request state
 */
export const PRStateSchema = z.enum([
  'opened',
  'updated',
  'merged',
  'closed',
  'draft',
]);

export type PRState = z.infer<typeof PRStateSchema>;

/**
 * File-level diff with secret redaction
 */
export const FileDiffSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(), // For renames
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  changes: z.number().int().min(0),
  patch: z.string().optional(), // Diff content (may be redacted)
  isRedacted: z.boolean().default(false), // True if secrets were detected and redacted
  detectedSecrets: z.array(z.string()).optional(), // Types of secrets detected
});

export type FileDiff = z.infer<typeof FileDiffSchema>;

/**
 * Pull Request data structure
 */
export const PullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().optional(),
  state: PRStateSchema,
  author: z.string(), // User identifier
  baseBranch: z.string(),
  headBranch: z.string(),
  repository: z.string(), // "owner/repo"
  url: z.string().url(),
  
  // Changes
  files: z.array(FileDiffSchema),
  totalAdditions: z.number().int().min(0),
  totalDeletions: z.number().int().min(0),
  
  // Status
  ciStatus: z.enum(['pending', 'success', 'failure', 'error', 'unknown']).optional(),
  testStatus: z.enum(['pending', 'passing', 'failing', 'error', 'unknown']).optional(),
  mergeable: z.boolean().optional(),
  
  // Metadata
  labels: z.array(z.string()).optional(),
  reviewers: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.string().optional(),
  
  // Cross-references
  linkedIssues: z.array(z.string()).optional(), // Issue numbers/IDs
  linkedSpecs: z.array(z.string()).optional(), // Spec document IDs
  linkedDesigns: z.array(z.string()).optional(), // Design file IDs
  
  createdAt: z.date(),
  updatedAt: z.date(),
  mergedAt: z.date().optional(),
  closedAt: z.date().optional(),
});

export type PullRequest = z.infer<typeof PullRequestSchema>;

/**
 * Commit data structure
 */
export const CommitSchema = z.object({
  id: z.string(), // SHA
  message: z.string(),
  author: z.string(),
  committer: z.string(),
  repository: z.string(),
  branch: z.string(),
  url: z.string().url(),
  files: z.array(FileDiffSchema),
  createdAt: z.date(),
});

export type Commit = z.infer<typeof CommitSchema>;

/**
 * CODEOWNERS or repository ownership metadata
 */
export const CodeOwnershipSchema = z.object({
  path: z.string(), // File or directory path pattern
  owners: z.array(z.object({
    type: z.enum(['user', 'team', 'email']),
    identifier: z.string(),
    roles: z.array(RoleSchema).optional(), // Mapped roles if known
  })),
});

export type CodeOwnership = z.infer<typeof CodeOwnershipSchema>;

/**
 * Semantic code change interpretation
 * 
 * AI-generated analysis with confidence and evidence
 */
export const CodeChangeInterpretationSchema = z.object({
  // Classification
  classification: ChangeClassificationSchema,
  intent: ChangeIntentSchema,
  confidence: ConfidenceLevelSchema,
  
  // Detection
  apiContractChanges: z.array(z.string()).optional(), // API endpoints/functions changed
  uiBehaviorChanges: z.array(z.string()).optional(), // UI components/features affected
  migrationRisk: z.boolean().optional(), // Requires migration
  rolloutRisk: z.enum(['low', 'medium', 'high']).optional(),
  
  // Impact
  impactedComponents: z.array(z.string()), // Modules, packages, services
  affectedRoles: z.array(RoleSchema), // Roles that should be notified
  dependentTeams: z.array(z.string()).optional(), // Team names/identifiers
  
  // Evidence for interpretation
  evidence: z.array(z.object({
    type: z.enum(['file-path', 'function-name', 'api-signature', 'import', 'comment', 'commit-message']),
    value: z.string(),
    relevance: z.string(), // Why this evidence supports the interpretation
  })),
  
  // Related resources
  relatedSpecs: z.array(z.string()).optional(), // Spec IDs that might be affected
  relatedDesigns: z.array(z.string()).optional(), // Design IDs that might be affected
  relatedTickets: z.array(z.string()).optional(), // Issue/ticket IDs
});

export type CodeChangeInterpretation = z.infer<typeof CodeChangeInterpretationSchema>;

/**
 * Engineering-focused output proposal
 * All require explicit human approval
 */
export const CodeChangeProposalSchema = z.object({
  id: z.string().uuid(),
  changeEventId: z.string().uuid(),
  
  type: z.enum([
    'pr-summary',
    'review-routing',
    'spec-alignment-check',
    'design-alignment-check',
    'documentation-suggestion',
    'migration-checklist',
    'release-notes',
    'integration-task',
  ]),
  
  content: z.string(), // Generated content/suggestion
  targetResource: z.object({
    tool: z.string(),
    resourceId: z.string(),
    resourceUrl: z.string().url().optional(),
  }).optional(), // Where this should be applied
  
  status: z.enum(['pending', 'approved', 'rejected', 'applied']),
  approvedBy: z.string().uuid().optional(),
  approvedAt: z.date().optional(),
  
  createdAt: z.date(),
});

export type CodeChangeProposal = z.infer<typeof CodeChangeProposalSchema>;
