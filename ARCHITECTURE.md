# SyncUp Architecture

## System Overview

SyncUp is a Role-Aware Cross-Tool Change Synchronization Platform that ensures changes from tools like GitHub, Notion, Figma, etc. are understood, relevant, and actionable - **only for the people who should see them**.

## Core Principles

1. **Noise is a system failure** - Notifications must ONLY be sent to people whose roles are relevant
2. **Synchronization = Aligning Intent** - Not copying data, but making changes understandable and actionable
3. **Human-in-the-loop** - AI assists; it never replaces judgment
4. **Trust through explainability** - Always explain what changed, why it matters, who is impacted

## Architecture Layers

### 1. Change Detection Layer

**Purpose**: Detect changes from integrated tools through authorized integrations only.

**Components**:
- **Webhook Handler**: Receives and verifies webhooks from tools
- **Cursor Poller**: Polls tools without reliable webhooks using cursor-based detection
- **Tool Integrations**: GitHub, Notion, Figma, Jira/Linear, Slack

**Key Requirements**:
- Idempotent detection
- Replayable cursor advances
- Auditable change history
- Resilient to outages

### 2. Normalization Layer

**Purpose**: Convert all tool-specific changes into canonical `ChangeEvent` format.

**Components**:
- **Change Normalization Service**: Transforms raw change data into `ChangeEvent`
- **Tool-Specific Normalizers**: GitHub, Notion, Figma normalizers

**Output**: Single canonical `ChangeEvent` format containing:
- Who changed what
- Where it happened
- How it changed (diffs/versions)
- When it occurred
- Source tool and evidence

### 3. AI Interpretation Layer

**Purpose**: Provide semantic understanding of changes.

**Components**:
- **AI Interpretation Service**: Classifies changes, infers intent, analyzes impact
- **Code Change Interpreter**: Specialized interpretation for Git/code changes

**Outputs**:
- Classification: cosmetic, functional, breaking
- Intent: bug fix, refactor, feature addition, migration, etc.
- Impact: affected roles, components, teams
- Confidence levels with evidence citations

**Requirements**:
- Must never fabricate intent
- Must never hide uncertainty
- Must include evidence for all interpretations

### 4. Role-Based Routing Layer

**Purpose**: Determine which channels should receive notifications based on strict role relevance.

**Components**:
- **Role-Based Routing Service**: Applies guardrails and routes changes
- **Code Change Role Guardrails**: Role-specific content filtering for code changes

**Non-Negotiable Rules**:
- Engineering channels receive: diffs, technical summaries, build/test status
- Product/Design receive: behavior-impact summaries only when relevant
- Sales/Marketing receive: customer-facing impact summaries only, never raw diffs
- Everyone channel: only major breaking changes or releases

**Output**: Array of `Notification` objects in "pending" status, requiring approval

### 5. Notification Layer

**Purpose**: Manage notification lifecycle and delivery.

**Components**:
- **Notification Service**: Creates, approves, rejects, sends notifications
- **Delivery Integrations**: Slack, Email, In-app, Desktop (Tauri)

**Lifecycle**:
1. **Pending**: Created by routing service, awaiting approval
2. **Approved**: Approved by human, ready to send
3. **Rejected**: Rejected by human, not sent
4. **Sent**: Successfully delivered

**Requirements**:
- All notifications require explicit human approval
- Never auto-send without approval

### 6. Orchestration Layer

**Purpose**: Coordinate end-to-end processing pipeline.

**Components**:
- **Orchestration Service**: Ties together all services

**Pipeline**:
```
Raw Change → Normalization → AI Interpretation → Role-Based Routing → Notification Creation
```

## Data Flow

### Webhook Flow

```
Tool Webhook → Change Detection → Raw Change Data → Normalization → ChangeEvent
                                                                       ↓
Notification ← Notification Service ← Routing ← AI Interpretation ← ChangeEvent
```

### Cursor Polling Flow

```
Cursor Poller → Tool API → Raw Change Data → Normalization → ChangeEvent
                                                                       ↓
                                                                   Cursor Advance
                                                                       ↓
Notification ← Notification Service ← Routing ← AI Interpretation ← ChangeEvent
```

## Key Data Structures

### ChangeEvent (Canonical)

Single normalized format for all changes:

```typescript
{
  id: UUID
  changedBy: string
  changedAt: Date
  sourceTool: 'github' | 'notion' | 'figma' | ...
  sourceResourceId: string
  sourceResourceType: string
  diff?: string
  version?: string
  classification?: 'cosmetic' | 'functional' | 'breaking'
  intent?: 'bug-fix' | 'refactor' | 'feature-addition' | ...
  confidence?: 'low' | 'medium' | 'high' | 'very-high'
  affectedRoles?: Role[]
  evidence?: string[]
  // ...
}
```

### Notification

Represents a pending or sent notification:

```typescript
{
  id: UUID
  changeEventId: UUID
  channelId: UUID
  role?: Role
  summary: string      // What changed
  impact: string       // Why it matters
  relevance: string    // Why this role should see it
  suggestedAction?: string
  status: 'pending' | 'approved' | 'rejected' | 'sent'
  // ...
}
```

### Cursor

Tracks polling position for change detection:

```typescript
{
  id: UUID
  companyGroupId: UUID
  sourceTool: SourceTool
  position: string  // Timestamp, version ID, change token, etc.
  positionType: 'timestamp' | 'version-id' | 'change-token' | ...
  lastPolledAt: Date
  // ...
}
```

## Company Groups & Channels

### Company Group

- Contains users, channels, integrations
- All change interpretation and routing occurs within groups
- Users join or create groups during onboarding

### Channel Types

1. **Everyone Channel**: Company-wide, reserved for major cross-cutting impacts
2. **Role-Specific Channels**: #engineering-frontend, #design, #product, etc.

### Channel Rules

- Role channels must NEVER receive unrelated technical or business noise
- Programmer notes must NEVER appear in Sales channels
- Everyone channel requires high confidence and human approval

## Code Change Synchronization

### Specialized Handling for Git/Code Changes

**Captured**:
- Commits, PRs (opened/updated/merged)
- File-level diffs (with secret redaction)
- Impacted packages/modules
- Test and CI status
- CODEOWNERS metadata

**Semantic Interpretation**:
- API contract changes
- UI behavior changes
- Migration or rollout risk
- Impacted components and dependent teams

**Engineering-Focused Outputs** (require approval):
- PR summaries
- Review routing suggestions
- Spec/design alignment checks
- Documentation update suggestions
- Migration checklists
- Release notes snippets

## Security & Privacy

### Data Access

- Only accesses data from tools explicitly connected by user
- Does not watch screens, record activity, or capture screenshots
- Visual analysis limited to tool-provided versions

### Secret Redaction

- Automatically detects and redacts secrets from diffs
- API keys, tokens, passwords, private keys
- Redacted content replaced with placeholders

## Technology Stack

- **Platform**: macOS (MacBook first-class support)
- **Runtime**: Node.js + TypeScript
- **Desktop Framework**: Tauri (lightweight, secure, native)
- **Database**: SQLite (local) + PostgreSQL (company groups, sync)
- **Validation**: Zod schemas
- **Logging**: Winston

## Future Enhancements

1. **Database Layer**: Persistence for users, groups, channels, cursors, events
2. **Webhook Server**: Express server for receiving webhooks
3. **Desktop UI**: Tauri-based macOS application
4. **LLM Integration**: OpenAI/Anthropic for AI interpretation
5. **Notification Delivery**: Slack, Email, Desktop notifications
6. **Tool Integrations**: Complete implementations for all tools
7. **Testing**: Unit and integration tests
