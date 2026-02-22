# Zinc.ai: Role-Aware Cross-Tool Change Synchronization Platform

A macOS-first platform that synchronizes and intelligently routes changes across tools (Notion, Figma, GitHub, Jira/Linear, Slack) based on role relevance.

## Core Principles

1. **Noise is a system failure** - Notifications must ONLY be sent to people whose roles are relevant
2. **Synchronization = Aligning Intent** - Not copying data, but making changes understandable and actionable
3. **Human-in-the-loop** - AI assists; it never replaces judgment
4. **Trust through explainability** - Always explain what changed, why it matters, who is impacted

## Key Features

- **Cursor-based change detection** - Idempotent, replayable, auditable
- **Normalized change events** - Single canonical format for all tool changes
- **Role-based routing** - Strict guardrails prevent irrelevant notifications
- **Code change synchronization** - Semantic interpretation of Git changes with role-aware routing
- **Company groups & channels** - Organized by role with company-wide reserved for major impacts

## Technology Stack

- **Platform**: macOS (MacBook first-class support)
- **Runtime**: Node.js + TypeScript
- **Desktop Framework**: Tauri (lightweight, secure, native)
- **Database**: SQLite (local) + PostgreSQL (company groups, sync)
- **AI**: Structured prompts with confidence scoring

## Architecture

```
┌─────────────────┐
│  Tool Integrations (GitHub, Notion, Figma, etc.) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Change Detection (Webhooks + Cursors) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Change Normalization (Canonical ChangeEvent) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AI Interpretation (Semantic Analysis + Confidence) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Role-Based Routing Engine (Strict Guardrails) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Notification System (Role-Relevant Only) │
└─────────────────┘
```

## Getting Started

```bash
npm install
npm run dev
```

## Non-Negotiable Rules

1. ✅ Notifications ONLY to relevant roles
2. ❌ Never auto-edit or auto-merge
3. ❌ Never fabricate intent or hide uncertainty
4. ❌ Never send programmer notes to Sales channels
5. ✅ Always require human approval for actions
