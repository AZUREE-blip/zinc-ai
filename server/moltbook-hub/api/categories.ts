/**
 * Moltbook Hub - Categories API
 *
 * Company compartments — AI auto-creates and manages these.
 * E.g. a factory company gets: "Pricing", "Products", "Factory Ops", "Logistics"
 * E.g. a SaaS company gets: "Engineering", "Customer Support", "Sales", "Billing"
 *
 * The AI learns the company's structure and files knowledge into the right compartment.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MoltbookDB } from '../db/schema';

export function registerCategoryRoutes(app: FastifyInstance, db: MoltbookDB) {
  /**
   * Get all categories for a company (the compartment tree)
   */
  app.get('/api/categories', async (
    request: FastifyRequest<{ Querystring: { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId } = request.query;
    const categories = db.getCompanyCategories(companyId);

    // Build tree structure: top-level + children
    const topLevel = categories.filter(c => !c.parentId);
    const tree = topLevel.map(cat => ({
      ...cat,
      children: categories.filter(c => c.parentId === cat.id),
    }));

    return reply.send({ categories: tree });
  });

  /**
   * Get or create a category.
   * AI calls this when it discovers a new area the company operates in.
   */
  app.post('/api/categories', async (
    request: FastifyRequest<{
      Body: {
        companyId: string;
        name: string;
        description?: string;
        keywords?: string[];
        parentId?: string;
      }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, name, description, keywords, parentId } = request.body;

    const category = db.getOrCreateCategory(
      companyId,
      name,
      description || '',
      keywords || [],
      parentId
    );

    return reply.send({ category });
  });

  /**
   * Auto-categorize: given keywords and summary, find or create the best category.
   * This is the main endpoint the routing system calls.
   */
  app.post('/api/categories/auto-assign', async (
    request: FastifyRequest<{
      Body: {
        companyId: string;
        keywords: string[];
        actionType: string;
        summary: string;
        contextId?: string;    // If assigning a context upload
        knowledgeId?: string;  // If assigning a knowledge entry
      }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, keywords, actionType, summary, contextId, knowledgeId } = request.body;

    // 1. Try to find an existing category that matches
    let category = db.findMatchingCategory(companyId, keywords);

    // 2. If no match, auto-create a category from the context
    if (!category) {
      const categoryName = inferCategoryName(actionType, keywords, summary);
      const categoryDesc = `Auto-created from: ${summary.slice(0, 100)}`;

      category = db.getOrCreateCategory(
        companyId,
        categoryName,
        categoryDesc,
        keywords.slice(0, 10) // Keep top 10 keywords
      );
    }

    // 3. Assign the item to this category
    if (contextId) {
      db.assignContextToCategory(contextId, category.id);
    }
    if (knowledgeId) {
      db.assignKnowledgeToCategory(knowledgeId, category.id);
    }

    return reply.send({
      categoryId: category.id,
      categoryName: category.name,
      isNew: category.itemCount <= 1,
    });
  });

  /**
   * Get knowledge within a specific category compartment
   */
  app.get('/api/categories/:categoryId/knowledge', async (
    request: FastifyRequest<{
      Params: { categoryId: string };
      Querystring: { companyId: string; keywords?: string }
    }>,
    reply: FastifyReply
  ) => {
    const { categoryId } = request.params;
    const { companyId, keywords } = request.query;

    const keywordList = keywords ? keywords.split(',').map(k => k.trim()) : undefined;
    const knowledge = db.searchKnowledgeByCategory(companyId, categoryId, keywordList);

    return reply.send({ knowledge });
  });

  /**
   * Get category children (sub-compartments)
   */
  app.get('/api/categories/:categoryId/children', async (
    request: FastifyRequest<{ Params: { categoryId: string } }>,
    reply: FastifyReply
  ) => {
    const { categoryId } = request.params;
    const children = db.getCategoryChildren(categoryId);
    return reply.send({ children });
  });
}

/**
 * Infer a category name from the action type and keywords.
 * This creates human-readable compartment names like:
 * "Pricing", "Customer Support", "Product Development", "Meeting Scheduling"
 */
function inferCategoryName(actionType: string, keywords: string[], summary: string): string {
  // Try to identify domain from keywords
  const keywordsLower = keywords.map(k => k.toLowerCase());
  const summaryLower = summary.toLowerCase();

  // Common business domains — match keywords to compartments
  const domainMap: [string[], string][] = [
    [['price', 'pricing', 'cost', 'quote', 'invoice', 'billing', 'payment'], 'Pricing & Billing'],
    [['product', 'inventory', 'stock', 'catalog', 'sku', 'item'], 'Products & Inventory'],
    [['factory', 'manufacturing', 'production', 'assembly', 'warehouse'], 'Factory & Production'],
    [['shipping', 'delivery', 'logistics', 'tracking', 'freight', 'order'], 'Shipping & Logistics'],
    [['customer', 'support', 'ticket', 'complaint', 'help', 'issue'], 'Customer Support'],
    [['sale', 'sales', 'lead', 'deal', 'prospect', 'client', 'pipeline'], 'Sales'],
    [['hr', 'hiring', 'recruit', 'employee', 'onboarding', 'payroll'], 'HR & People'],
    [['marketing', 'campaign', 'ad', 'social', 'brand', 'content'], 'Marketing'],
    [['engineering', 'code', 'deploy', 'bug', 'feature', 'pr', 'release'], 'Engineering'],
    [['design', 'figma', 'ui', 'ux', 'mockup', 'prototype'], 'Design'],
    [['finance', 'budget', 'expense', 'revenue', 'accounting'], 'Finance'],
    [['legal', 'contract', 'compliance', 'nda', 'policy'], 'Legal & Compliance'],
    [['meeting', 'calendar', 'schedule', 'agenda', 'standup'], 'Meetings & Scheduling'],
    [['project', 'task', 'sprint', 'milestone', 'deadline'], 'Project Management'],
  ];

  for (const [matchWords, categoryName] of domainMap) {
    const hasKeywordMatch = keywordsLower.some(kw =>
      matchWords.some(mw => kw.includes(mw) || mw.includes(kw))
    );
    const hasSummaryMatch = matchWords.some(mw => summaryLower.includes(mw));

    if (hasKeywordMatch || hasSummaryMatch) {
      return categoryName;
    }
  }

  // Fallback: create from action type
  const actionNameMap: Record<string, string> = {
    'book_meeting': 'Meetings & Scheduling',
    'send_message': 'Communications',
    'review_document': 'Document Reviews',
    'approve_request': 'Approvals',
    'schedule_task': 'Task Management',
    'follow_up': 'Follow-ups',
    'share_update': 'Updates & Announcements',
    'escalate': 'Escalations',
  };

  return actionNameMap[actionType] || 'General';
}
