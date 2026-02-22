/**
 * Moltbook Hub - Outcomes API
 *
 * Record outcomes of suggestions for learning.
 * This is how the circuit gets smarter over time.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MoltbookDB } from '../db/schema';
import type { RecordOutcomeRequest } from '../types';

export function registerOutcomeRoutes(app: FastifyInstance, db: MoltbookDB) {
  /**
   * Record outcome of a suggestion
   * Called when user accepts/rejects/edits a suggestion
   */
  app.post('/api/outcomes/record', async (
    request: FastifyRequest<{
      Body: RecordOutcomeRequest & { companyId: string; userId: string }
    }>,
    reply: FastifyReply
  ) => {
    const {
      suggestionId,
      companyId,
      userId,
      action,
      wasSuccessful,
      editedText,
      feedback,
    } = request.body;

    // Record the outcome
    const outcome = db.recordOutcome(
      suggestionId,
      companyId,
      userId,
      action,
      wasSuccessful,
      editedText,
      feedback
    );

    // If we know whether it was successful, use that to learn
    if (wasSuccessful !== undefined) {
      await learnFromOutcome(db, suggestionId, action, wasSuccessful);
    }

    return reply.status(201).send({
      id: outcome.id,
      recorded: true,
    });
  });

  /**
   * Report final success/failure of an action
   * Called after local AI executes the action
   */
  app.post('/api/outcomes/:outcomeId/result', async (
    request: FastifyRequest<{
      Params: { outcomeId: string };
      Body: { wasSuccessful: boolean; details?: string }
    }>,
    reply: FastifyReply
  ) => {
    const { outcomeId } = request.params;
    const { wasSuccessful, details } = request.body;

    // TODO: Update outcome with final result
    // For now, just return success

    return reply.send({
      success: true,
      message: wasSuccessful
        ? 'Action completed successfully'
        : 'Action failed - routing may be adjusted',
    });
  });

  /**
   * Get learning stats for the company
   */
  app.get('/api/outcomes/stats', async (
    request: FastifyRequest<{ Querystring: { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId } = request.query;

    // TODO: Aggregate stats from outcomes table
    // For now, return placeholder

    return reply.send({
      totalSuggestions: 0,
      acceptedRate: 0,
      successRate: 0,
      topActionTypes: [],
      improvementTrend: 'stable',
    });
  });
}

/**
 * Learn from an outcome - adjust routing rules
 */
async function learnFromOutcome(
  db: MoltbookDB,
  suggestionId: string,
  action: string,
  wasSuccessful: boolean
): Promise<void> {
  // Get the suggestion to find the routing rule used
  const suggestions = db.getPendingSuggestions(''); // TODO: Get by ID

  // If accepted and successful, boost confidence
  // If rejected or failed, reduce confidence

  // This is where the magic happens:
  // - Successful routing → increase rule confidence
  // - Failed routing → decrease rule confidence
  // - Over time, good rules rise, bad rules fall

  // TODO: Implement proper learning algorithm
  // For now, this is a placeholder

  console.log(`Learning from outcome: suggestion=${suggestionId}, action=${action}, success=${wasSuccessful}`);
}
