/**
 * Moltbook Hub - Routing API
 *
 * Routes context/questions to the right user.
 * "Who handles booking?" → "User B"
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MoltbookDB } from '../db/schema';
import type { UploadContextRequest } from '../types';
import { redactText, redactArray } from '../privacy-filter';

export function registerRoutingRoutes(app: FastifyInstance, db: MoltbookDB) {
  /**
   * Upload context and get routing suggestion
   * This is the main endpoint - local AI sends extracted context,
   * Hub figures out who should handle it
   */
  app.post('/api/context/upload', async (
    request: FastifyRequest<{
      Body: UploadContextRequest & { companyId: string; userId: string }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, userId, people, actionType, keywords, summary, urgency } = request.body;

    // --- PRIVACY GATE 4: Server-side PII Redaction ---
    // Final defense: redact before database write, even if client missed something
    const cleanSummary = redactText(summary);
    const cleanKeywords = redactArray(keywords);

    // 1. Save the context (with redacted data)
    const context = db.saveContext(
      companyId,
      userId,
      people,
      actionType,
      cleanKeywords,
      cleanSummary,
      urgency
    );

    // 1b. Auto-categorize into the right compartment
    try {
      let category = db.findMatchingCategory(companyId, keywords);
      if (!category) {
        // AI creates a new compartment based on what this context is about
        const categoryName = inferCategoryFromContext(actionType, keywords, summary);
        category = db.getOrCreateCategory(companyId, categoryName, `Auto-created from context`, keywords.slice(0, 10));
      }
      db.assignContextToCategory(context.id, category.id);
    } catch { /* categorization is best-effort */ }

    // 2. Find who should handle this
    const routingResult = await routeContext(db, companyId, actionType, keywords, people);

    if (!routingResult.targetUserId) {
      return reply.send({
        contextId: context.id,
        routed: false,
        message: 'No suitable handler found',
      });
    }

    // 3. Create suggestion for target user (using redacted text)
    const suggestion = db.createSuggestion(
      companyId,
      context.id,
      userId,
      routingResult.targetUserId,
      truncateText(cleanSummary, 50),  // Short text for pill
      cleanSummary,                     // Full text
      actionType,
      routingResult.primaryAction,
      routingResult.secondaryActions
    );

    return reply.send({
      contextId: context.id,
      routed: true,
      targetUserId: routingResult.targetUserId,
      targetUserName: routingResult.targetUserName,
      suggestionId: suggestion.id,
      confidence: routingResult.confidence,
    });
  });

  /**
   * Ask "who handles X?"
   */
  app.post('/api/routing/who-handles', async (
    request: FastifyRequest<{
      Body: { companyId: string; actionType: string; keywords: string[] }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, actionType, keywords } = request.body;

    const result = await routeContext(db, companyId, actionType, keywords, []);

    if (!result.targetUserId) {
      return reply.send({
        found: false,
        message: 'No handler found for this type of request',
      });
    }

    return reply.send({
      found: true,
      userId: result.targetUserId,
      userName: result.targetUserName,
      confidence: result.confidence,
      reason: result.reason,
    });
  });

  /**
   * Add/update routing rule
   */
  app.post('/api/routing/rules', async (
    request: FastifyRequest<{
      Body: {
        companyId: string;
        keywords: string[];
        actionTypes: string[];
        assignedUserId: string;
        assignedRole?: string;
      }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, keywords, actionTypes, assignedUserId, assignedRole } = request.body;

    const rule = db.addRoutingRule(
      companyId,
      keywords,
      actionTypes,
      assignedUserId,
      assignedRole
    );

    return reply.status(201).send({
      id: rule.id,
      keywords: rule.keywords,
      actionTypes: rule.actionTypes,
      assignedUserId: rule.assignedUserId,
    });
  });

  /**
   * Get pending suggestions for a user
   */
  app.get('/api/suggestions/pending', async (
    request: FastifyRequest<{ Querystring: { userId: string } }>,
    reply: FastifyReply
  ) => {
    const { userId } = request.query;

    const suggestions = db.getPendingSuggestions(userId);

    return reply.send({
      suggestions: suggestions.map(s => ({
        id: s.id,
        shortText: s.shortText,
        fullText: s.fullText,
        actionType: s.actionType,
        primaryAction: s.primaryAction,
        secondaryActions: s.secondaryActions,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  });

  /**
   * Mark suggestion as shown
   */
  app.post('/api/suggestions/:suggestionId/shown', async (
    request: FastifyRequest<{ Params: { suggestionId: string } }>,
    reply: FastifyReply
  ) => {
    const { suggestionId } = request.params;

    db.updateSuggestionStatus(suggestionId, 'shown');

    return reply.send({ success: true });
  });
}

/**
 * Route context to the best user
 */
async function routeContext(
  db: MoltbookDB,
  companyId: string,
  actionType: string,
  keywords: string[],
  people: string[]
): Promise<{
  targetUserId: string | null;
  targetUserName: string | null;
  confidence: number;
  reason: string;
  primaryAction: string;
  secondaryActions: string[];
}> {
  // 1. Try routing rules first
  const rule = db.findRoutingRule(companyId, keywords, actionType);

  if (rule && rule.confidence > 0.3) {
    const user = db.getUser(rule.assignedUserId);
    return {
      targetUserId: rule.assignedUserId,
      targetUserName: user?.name || null,
      confidence: rule.confidence,
      reason: `Matched routing rule for ${actionType}`,
      primaryAction: getDefaultPrimaryAction(actionType),
      secondaryActions: ['Edit', 'Skip'],
    };
  }

  // 2. Try matching by responsibility
  const users = db.getCompanyUsers(companyId);
  const actionKeyword = actionTypeToResponsibility(actionType);

  for (const user of users) {
    const hasResponsibility = user.responsibilities.some(r =>
      r.toLowerCase().includes(actionKeyword.toLowerCase())
    );

    if (hasResponsibility) {
      return {
        targetUserId: user.id,
        targetUserName: user.name,
        confidence: 0.6,
        reason: `User has responsibility: ${actionKeyword}`,
        primaryAction: getDefaultPrimaryAction(actionType),
        secondaryActions: ['Edit', 'Skip'],
      };
    }
  }

  // 3. No match found
  return {
    targetUserId: null,
    targetUserName: null,
    confidence: 0,
    reason: 'No matching handler found',
    primaryAction: 'Handle',
    secondaryActions: ['Skip'],
  };
}

/**
 * Map action type to responsibility keyword
 */
function actionTypeToResponsibility(actionType: string): string {
  const mapping: Record<string, string> = {
    'book_meeting': 'scheduling',
    'send_message': 'communication',
    'review_document': 'review',
    'approve_request': 'approval',
    'schedule_task': 'task management',
    'follow_up': 'follow-up',
    'share_update': 'updates',
    'escalate': 'escalation',
  };

  return mapping[actionType] || actionType;
}

/**
 * Get default primary action button text
 */
function getDefaultPrimaryAction(actionType: string): string {
  const mapping: Record<string, string> = {
    'book_meeting': 'Book it',
    'send_message': 'Send',
    'review_document': 'Review',
    'approve_request': 'Approve',
    'schedule_task': 'Schedule',
    'follow_up': 'Follow up',
    'share_update': 'Share',
    'escalate': 'Escalate',
  };

  return mapping[actionType] || 'Do it';
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Infer a category compartment name from context.
 * The AI uses keywords and action type to figure out which area of the company
 * this information belongs to (Pricing, Products, Factory Ops, etc).
 */
function inferCategoryFromContext(actionType: string, keywords: string[], summary: string): string {
  const combined = [...keywords.map(k => k.toLowerCase()), summary.toLowerCase()].join(' ');

  const domainPatterns: [RegExp, string][] = [
    [/price|pricing|cost|quote|invoice|billing|payment|discount|margin/i, 'Pricing & Billing'],
    [/product|inventory|stock|catalog|sku|item|goods|merchandise/i, 'Products & Inventory'],
    [/factory|manufactur|production|assembly|warehouse|quality control/i, 'Factory & Production'],
    [/ship|deliver|logistics|tracking|freight|order|dispatch/i, 'Shipping & Logistics'],
    [/customer|support|ticket|complaint|help desk|service/i, 'Customer Support'],
    [/sale|lead|deal|prospect|client|pipeline|crm|account/i, 'Sales'],
    [/hr|hiring|recruit|employee|onboard|payroll|benefit/i, 'HR & People'],
    [/marketing|campaign|ad\b|social media|brand|content|seo/i, 'Marketing'],
    [/engineer|code|deploy|bug|feature|release|api|github/i, 'Engineering'],
    [/design|figma|ui|ux|mockup|prototype|wireframe/i, 'Design'],
    [/financ|budget|expense|revenue|account|tax/i, 'Finance'],
    [/legal|contract|compliance|nda|policy|regulation/i, 'Legal & Compliance'],
    [/meeting|calendar|schedule|agenda|standup/i, 'Meetings & Scheduling'],
    [/project|task|sprint|milestone|deadline|roadmap/i, 'Project Management'],
  ];

  for (const [pattern, name] of domainPatterns) {
    if (pattern.test(combined)) return name;
  }

  // Fallback by action type
  const actionCategoryMap: Record<string, string> = {
    'book_meeting': 'Meetings & Scheduling',
    'send_message': 'Communications',
    'review_document': 'Document Reviews',
    'approve_request': 'Approvals',
    'schedule_task': 'Task Management',
    'follow_up': 'Follow-ups',
    'share_update': 'Updates & Announcements',
    'escalate': 'Escalations',
  };

  return actionCategoryMap[actionType] || 'General';
}
