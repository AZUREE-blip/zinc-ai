/**
 * Moltbook Hub - Knowledge API
 *
 * Store and query shared knowledge across the company.
 * This is how agents learn from each other.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MoltbookDB } from '../db/schema';
import type { ShareKnowledgeRequest, QueryRequest } from '../types';

export function registerKnowledgeRoutes(app: FastifyInstance, db: MoltbookDB) {
  /**
   * Share knowledge - when an agent solves something, share it
   */
  app.post('/api/knowledge/share', async (
    request: FastifyRequest<{
      Body: ShareKnowledgeRequest & { companyId: string; userId: string }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, userId, situation, keywords, actionType, solution, steps } = request.body;

    const knowledge = db.addKnowledge(
      companyId,
      userId,
      situation,
      keywords,
      actionType,
      solution,
      steps
    );

    // Auto-categorize into the right compartment
    try {
      let category = db.findMatchingCategory(companyId, keywords);
      if (!category) {
        const categoryName = inferKnowledgeCategory(actionType, keywords, situation);
        category = db.getOrCreateCategory(companyId, categoryName, `Auto-created from knowledge`, keywords.slice(0, 10));
      }
      db.assignKnowledgeToCategory(knowledge.id, category.id);
    } catch { /* categorization is best-effort */ }

    return reply.status(201).send({
      id: knowledge.id,
      situation: knowledge.situation,
      solution: knowledge.solution,
    });
  });

  /**
   * Search knowledge - find relevant solutions
   */
  app.post('/api/knowledge/search', async (
    request: FastifyRequest<{
      Body: { companyId: string; keywords: string[]; actionType?: string }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, keywords, actionType } = request.body;

    const results = db.searchKnowledge(companyId, keywords, actionType);

    return reply.send({
      results: results.map(k => ({
        id: k.id,
        situation: k.situation,
        solution: k.solution,
        steps: k.steps,
        successRate: k.successCount / Math.max(1, k.successCount + k.failureCount),
        usageCount: k.successCount + k.failureCount,
      })),
    });
  });

  /**
   * Query knowledge - ask a question, get relevant answers
   */
  app.post('/api/knowledge/query', async (
    request: FastifyRequest<{
      Body: QueryRequest & { companyId: string }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, question, context } = request.body;

    // Extract keywords from question (simple approach)
    const keywords = extractKeywords(question);

    // Search knowledge base
    const results = db.searchKnowledge(companyId, keywords);

    if (results.length === 0) {
      return reply.send({
        answer: null,
        message: 'No relevant knowledge found',
        suggestions: [],
      });
    }

    // Return best matches
    return reply.send({
      answer: results[0].solution,
      confidence: results[0].successCount / Math.max(1, results[0].successCount + results[0].failureCount),
      relatedKnowledge: results.slice(0, 3).map(k => ({
        id: k.id,
        situation: k.situation,
        solution: k.solution,
      })),
    });
  });

  /**
   * Record knowledge usage outcome - did it help?
   */
  app.post('/api/knowledge/:knowledgeId/outcome', async (
    request: FastifyRequest<{
      Params: { knowledgeId: string };
      Body: { wasSuccessful: boolean }
    }>,
    reply: FastifyReply
  ) => {
    const { knowledgeId } = request.params;
    const { wasSuccessful } = request.body;

    db.updateKnowledgeStats(knowledgeId, wasSuccessful);

    return reply.send({ success: true });
  });

  /**
   * Get all knowledge for a company (for display/admin)
   */
  app.get('/api/knowledge', async (
    request: FastifyRequest<{ Querystring: { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId } = request.query;

    // Get all knowledge (search with empty keywords)
    const results = db.searchKnowledge(companyId, []);

    return reply.send({
      knowledge: results.map(k => ({
        id: k.id,
        situation: k.situation,
        solution: k.solution,
        keywords: k.keywords,
        actionType: k.actionType,
        successRate: k.successCount / Math.max(1, k.successCount + k.failureCount),
        usageCount: k.successCount + k.failureCount,
        createdAt: k.createdAt,
      })),
    });
  });
}

/**
 * Infer which category compartment a piece of knowledge belongs to.
 */
function inferKnowledgeCategory(actionType: string, keywords: string[], situation: string): string {
  const combined = [...keywords.map(k => k.toLowerCase()), situation.toLowerCase()].join(' ');

  const patterns: [RegExp, string][] = [
    [/price|pricing|cost|quote|invoice|billing|payment|discount/i, 'Pricing & Billing'],
    [/product|inventory|stock|catalog|sku|item/i, 'Products & Inventory'],
    [/factory|manufactur|production|assembly|warehouse/i, 'Factory & Production'],
    [/ship|deliver|logistics|tracking|freight|order/i, 'Shipping & Logistics'],
    [/customer|support|ticket|complaint|help/i, 'Customer Support'],
    [/sale|lead|deal|prospect|client|pipeline/i, 'Sales'],
    [/hr|hiring|recruit|employee|onboard/i, 'HR & People'],
    [/marketing|campaign|social|brand|content/i, 'Marketing'],
    [/engineer|code|deploy|bug|feature|release/i, 'Engineering'],
    [/design|figma|ui|ux|mockup/i, 'Design'],
    [/meeting|calendar|schedule|agenda/i, 'Meetings & Scheduling'],
    [/project|task|sprint|milestone/i, 'Project Management'],
  ];

  for (const [pattern, name] of patterns) {
    if (pattern.test(combined)) return name;
  }

  return 'General';
}

/**
 * Extract keywords from a question/text
 * Simple approach - split and filter common words
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'how', 'when', 'where', 'why', 'all', 'each', 'every', 'any', 'some',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Max 10 keywords
}
