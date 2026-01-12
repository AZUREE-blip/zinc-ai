/**
 * Change Normalization Service
 * 
 * Converts raw change data from various tools into canonical ChangeEvent format.
 * 
 * This is the single source of truth for all change events.
 * All AI interpretation and routing operates on ChangeEvent.
 */

import { ChangeEvent, SourceTool } from '../types/core';
import { RawChangeData } from './change-detection';
import { PullRequest, Commit, CodeChangeInterpretation } from '../types/code-changes';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export interface ChangeNormalizationService {
  /**
   * Normalize raw change data into canonical ChangeEvent
   * This is idempotent - same raw data should produce same ChangeEvent
   */
  normalize(rawChange: RawChangeData): Promise<ChangeEvent>;
}

/**
 * Implementation of ChangeNormalizationService
 */
export class ChangeNormalizationServiceImpl implements ChangeNormalizationService {
  constructor(
    private toolNormalizers: Map<SourceTool, (raw: RawChangeData) => Promise<ChangeEvent>>
  ) {}

  async normalize(rawChange: RawChangeData): Promise<ChangeEvent> {
    const normalizer = this.toolNormalizers.get(rawChange.tool);
    if (!normalizer) {
      throw new Error(`No normalizer configured for tool: ${rawChange.tool}`);
    }

    const normalized = await normalizer(rawChange);
    
    logger.info(`Normalized change from ${rawChange.tool}`, {
      changeEventId: normalized.id,
      sourceTool: normalized.sourceTool,
      resourceType: normalized.sourceResourceType,
    });

    return normalized;
  }
}

/**
 * Tool-specific normalizers
 */
export class Normalizers {
  /**
   * Normalize GitHub PR into ChangeEvent
   */
  static async normalizeGithubPR(
    pr: PullRequest,
    detectionMethod: 'webhook' | 'cursor-polling'
  ): Promise<ChangeEvent> {
    return {
      id: randomUUID(),
      changedBy: pr.author,
      changedAt: pr.updatedAt,
      sourceTool: 'github',
      sourceResourceId: pr.id,
      sourceResourceUrl: pr.url,
      sourceResourceType: 'pull_request',
      diff: pr.files.map(f => `${f.path}: +${f.additions}/-${f.deletions}`).join('\n'),
      rawChangeData: {
        number: pr.number,
        state: pr.state,
        files: pr.files,
        labels: pr.labels,
        reviewers: pr.reviewers,
        assignees: pr.assignees,
      },
      relatedResources: [
        ...(pr.linkedIssues?.map(issue => ({
          tool: 'github' as SourceTool,
          resourceId: issue,
          resourceUrl: undefined,
        })) || []),
        ...(pr.linkedSpecs?.map(spec => ({
          tool: 'notion' as SourceTool,
          resourceId: spec,
          resourceUrl: undefined,
        })) || []),
        ...(pr.linkedDesigns?.map(design => ({
          tool: 'figma' as SourceTool,
          resourceId: design,
          resourceUrl: undefined,
        })) || []),
      ],
      normalizedAt: new Date(),
      detectionMethod,
    };
  }

  /**
   * Normalize GitHub commit into ChangeEvent
   */
  static async normalizeGithubCommit(
    commit: Commit,
    detectionMethod: 'webhook' | 'cursor-polling'
  ): Promise<ChangeEvent> {
    return {
      id: randomUUID(),
      changedBy: commit.author,
      changedAt: commit.createdAt,
      sourceTool: 'github',
      sourceResourceId: commit.id,
      sourceResourceUrl: commit.url,
      sourceResourceType: 'commit',
      diff: commit.files.map(f => `${f.path}: +${f.additions}/-${f.deletions}`).join('\n'),
      rawChangeData: {
        message: commit.message,
        repository: commit.repository,
        branch: commit.branch,
        files: commit.files,
      },
      normalizedAt: new Date(),
      detectionMethod,
    };
  }

  /**
   * Normalize Notion page update into ChangeEvent
   */
  static async normalizeNotionPage(
    raw: RawChangeData,
    detectionMethod: 'webhook' | 'cursor-polling'
  ): Promise<ChangeEvent> {
    const data = raw.rawData;
    
    return {
      id: randomUUID(),
      changedBy: (data.user_id as string) || 'unknown',
      changedAt: raw.timestamp,
      sourceTool: 'notion',
      sourceResourceId: raw.resourceId,
      sourceResourceType: 'page',
      rawChangeData: data,
      normalizedAt: new Date(),
      detectionMethod,
    };
  }

  /**
   * Normalize Figma file change into ChangeEvent
   */
  static async normalizeFigmaFile(
    raw: RawChangeData,
    detectionMethod: 'webhook' | 'cursor-polling'
  ): Promise<ChangeEvent> {
    const data = raw.rawData;
    
    return {
      id: randomUUID(),
      changedBy: (data.triggered_by?.handle as string) || 'unknown',
      changedAt: raw.timestamp,
      sourceTool: 'figma',
      sourceResourceId: raw.resourceId,
      sourceResourceType: 'file',
      version: (data.version_id as string) || undefined,
      rawChangeData: data,
      normalizedAt: new Date(),
      detectionMethod,
    };
  }
}
