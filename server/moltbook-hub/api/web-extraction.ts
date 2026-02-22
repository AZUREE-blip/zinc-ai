/**
 * Moltbook Hub - Web Extraction API
 *
 * Endpoint for web extraction requests.
 * Currently a stub — real extraction can be added via Playwright or AI scraping.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface ExtractionRequest {
  url: string;
  schema: Record<string, any>;
  storeInMoltbook?: boolean;
  companyId?: string;
  userId?: string;
}

export function registerWebExtractionRoutes(app: FastifyInstance) {
  /**
   * Extract data from web page (stub — returns 501 until real impl added)
   */
  app.post('/api/web-extraction/extract', async (
    request: FastifyRequest<{
      Body: ExtractionRequest & { companyId: string; userId: string }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { url, schema } = request.body;

      if (!url || !schema) {
        return reply.status(400).send({
          error: 'Missing required fields: url and schema',
        });
      }

      // TODO: Implement real web extraction (Playwright + AI parsing)
      return reply.status(501).send({
        error: 'Web extraction not yet implemented',
        message: 'This endpoint will support AI-powered web scraping in a future release.',
      });
    } catch (error) {
      app.log.error('Web extraction error: %s', error instanceof Error ? error.message : String(error));
      return reply.status(500).send({
        error: 'Extraction failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * Health check for web extraction service
   */
  app.get('/api/web-extraction/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'web-extraction',
      available: false,
      timestamp: Date.now(),
    });
  });
}
