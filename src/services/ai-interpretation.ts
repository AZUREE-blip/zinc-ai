/**
 * AI Interpretation Service
 * 
 * Provides semantic interpretation of change events:
 * - Classification (cosmetic, functional, breaking)
 * - Intent inference (bug fix, refactor, feature, etc.)
 * - Impact analysis (affected roles, components, teams)
 * - Confidence scoring
 * 
 * All interpretations must include evidence citations.
 * Must never fabricate intent or hide uncertainty.
 */

import { ChangeEvent, Role, ConfidenceLevel } from '../types/core';
import { CodeChangeInterpretation } from '../types/code-changes';
import { logger } from '../utils/logger';

export interface AIInterpretationService {
  /**
   * Interpret a change event semantically
   * Returns classification, intent, impact, and confidence with evidence
   */
  interpretChangeEvent(changeEvent: ChangeEvent): Promise<{
    classification: 'cosmetic' | 'functional' | 'breaking';
    intent: 'bug-fix' | 'refactor' | 'feature-addition' | 'migration' | 'documentation' | 'other';
    confidence: ConfidenceLevel;
    affectedRoles: Role[];
    summary: string;
    impact: string;
    relevance: Record<Role, string>;
    suggestedAction?: string;
    evidence: string[];
  }>;

  /**
   * Interpret code change specifically
   * Includes API contract changes, UI behavior changes, etc.
   */
  interpretCodeChange(
    changeEvent: ChangeEvent,
    prData?: unknown
  ): Promise<CodeChangeInterpretation>;
}

/**
 * Implementation of AIInterpretationService
 * 
 * This is a placeholder - in production, this would integrate with:
 * - LLM API (OpenAI, Anthropic, etc.)
 * - Rule-based analysis
 * - Heuristic patterns
 */
export class AIInterpretationServiceImpl implements AIInterpretationService {
  constructor(
    private llmClient?: {
      interpretChange: (changeEvent: ChangeEvent) => Promise<{
        classification: string;
        intent: string;
        summary: string;
        impact: string;
        affectedRoles: string[];
      }>;
    }
  ) {}

  async interpretChangeEvent(changeEvent: ChangeEvent): Promise<{
    classification: 'cosmetic' | 'functional' | 'breaking';
    intent: 'bug-fix' | 'refactor' | 'feature-addition' | 'migration' | 'documentation' | 'other';
    confidence: ConfidenceLevel;
    affectedRoles: Role[];
    summary: string;
    impact: string;
    relevance: Record<Role, string>;
    suggestedAction?: string;
    evidence: string[];
  }> {
    // Use existing interpretation if available
    if (changeEvent.classification && changeEvent.intent && changeEvent.affectedRoles) {
      return {
        classification: changeEvent.classification,
        intent: changeEvent.intent,
        confidence: changeEvent.confidence || 'medium',
        affectedRoles: changeEvent.affectedRoles,
        summary: `Change to ${changeEvent.sourceResourceType} in ${changeEvent.sourceTool}`,
        impact: 'Change detected and needs review',
        relevance: this.buildRelevanceMap(changeEvent.affectedRoles, changeEvent),
        evidence: changeEvent.evidence || [],
      };
    }

    // TODO: Integrate with LLM or rule-based interpretation
    // For now, use heuristics

    const interpretation = await this.interpretWithHeuristics(changeEvent);

    logger.info(`Interpreted change event`, {
      changeEventId: changeEvent.id,
      classification: interpretation.classification,
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      affectedRoles: interpretation.affectedRoles,
    });

    return interpretation;
  }

  async interpretCodeChange(
    changeEvent: ChangeEvent,
    prData?: unknown
  ): Promise<CodeChangeInterpretation> {
    // TODO: Implement code-specific interpretation
    // Analyze:
    // - File paths for API contracts
    // - Function signatures
    // - Import/export changes
    // - Test changes
    // - Migration files

    const baseInterpretation = await this.interpretChangeEvent(changeEvent);

    return {
      classification: baseInterpretation.classification,
      intent: baseInterpretation.intent,
      confidence: baseInterpretation.confidence,
      impactedComponents: changeEvent.impactedComponents || [],
      affectedRoles: baseInterpretation.affectedRoles,
      evidence: baseInterpretation.evidence.map(e => ({
        type: 'file-path' as const,
        value: e,
        relevance: 'Found in change event',
      })),
    };
  }

  /**
   * Heuristic-based interpretation (fallback)
   * In production, this would be replaced/combined with LLM interpretation
   */
  private async interpretWithHeuristics(changeEvent: ChangeEvent): Promise<{
    classification: 'cosmetic' | 'functional' | 'breaking';
    intent: 'bug-fix' | 'refactor' | 'feature-addition' | 'migration' | 'documentation' | 'other';
    confidence: ConfidenceLevel;
    affectedRoles: Role[];
    summary: string;
    impact: string;
    relevance: Record<Role, string>;
    suggestedAction?: string;
    evidence: string[];
  }> {
    const evidence: string[] = [];
    const sourceTool = changeEvent.sourceTool;
    const resourceType = changeEvent.sourceResourceType;

    // Determine classification from resource type and content
    let classification: 'cosmetic' | 'functional' | 'breaking' = 'functional';
    let intent: 'bug-fix' | 'refactor' | 'feature-addition' | 'migration' | 'documentation' | 'other' = 'other';
    let confidence: ConfidenceLevel = 'medium';
    const affectedRoles: Role[] = [];

    // Tool-specific heuristics
    if (sourceTool === 'github') {
      if (resourceType === 'pull_request') {
        const prData = changeEvent.rawChangeData;
        const title = (prData?.title as string)?.toLowerCase() || '';
        const labels = (prData?.labels as string[]) || [];

        // Classification
        if (labels.includes('breaking') || title.includes('breaking')) {
          classification = 'breaking';
          evidence.push('PR labeled or titled as breaking change');
        } else if (labels.includes('refactor')) {
          classification = 'functional';
          intent = 'refactor';
          evidence.push('PR labeled as refactor');
        }

        // Intent
        if (title.includes('fix') || title.includes('bug')) {
          intent = 'bug-fix';
          evidence.push('PR title suggests bug fix');
        } else if (title.includes('feat') || title.includes('feature')) {
          intent = 'feature-addition';
          evidence.push('PR title suggests new feature');
        } else if (title.includes('refactor')) {
          intent = 'refactor';
          evidence.push('PR title suggests refactor');
        }

        // Default to engineering roles for code changes
        affectedRoles.push('engineering-frontend', 'engineering-backend');
      } else if (resourceType === 'commit') {
        const commitMessage = (changeEvent.rawChangeData?.message as string)?.toLowerCase() || '';
        if (commitMessage.includes('fix')) {
          intent = 'bug-fix';
        } else if (commitMessage.includes('feat')) {
          intent = 'feature-addition';
        }
        affectedRoles.push('engineering-frontend', 'engineering-backend');
      }
    } else if (sourceTool === 'notion') {
      if (resourceType === 'page') {
        // Notion pages typically affect product/design
        affectedRoles.push('product', 'design');
        classification = 'functional';
      }
    } else if (sourceTool === 'figma') {
      if (resourceType === 'file') {
        // Figma changes affect design and potentially frontend engineering
        affectedRoles.push('design', 'engineering-frontend');
        classification = 'functional';
      }
    }

    // Build summary and impact
    const summary = `${changeEvent.sourceTool} ${changeEvent.sourceResourceType} changed by ${changeEvent.changedBy}`;
    const impact = this.buildImpactStatement(classification, intent, affectedRoles);

    // Build relevance map
    const relevance = this.buildRelevanceMap(affectedRoles, changeEvent);

    return {
      classification,
      intent,
      confidence,
      affectedRoles,
      summary,
      impact,
      relevance,
      evidence,
    };
  }

  private buildImpactStatement(
    classification: string,
    intent: string,
    roles: Role[]
  ): string {
    const roleNames = roles.join(', ');
    return `This ${intent.replace('-', ' ')} is ${classification} and affects ${roleNames} work.`;
  }

  private buildRelevanceMap(
    affectedRoles: Role[],
    changeEvent: ChangeEvent
  ): Record<Role, string> {
    const relevance: Record<Role, string> = {} as Record<Role, string>;

    for (const role of affectedRoles) {
      if (role.startsWith('engineering-')) {
        relevance[role] = `Code change in ${changeEvent.sourceTool} affects ${role} work`;
      } else if (role === 'design') {
        relevance[role] = `Design change in ${changeEvent.sourceTool} affects design work`;
      } else if (role === 'product') {
        relevance[role] = `Change in ${changeEvent.sourceTool} may affect product requirements`;
      } else {
        relevance[role] = `Change in ${changeEvent.sourceTool} is relevant to ${role} role`;
      }
    }

    return relevance;
  }
}
