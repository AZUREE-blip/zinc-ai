/**
 * Moltbook Hub - Agents API
 *
 * Register users, manage agents (connected local AIs)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MoltbookDB } from '../db/schema';
import type { RegisterUserRequest, LoginRequest } from '../types';

export function registerAgentRoutes(app: FastifyInstance, db: MoltbookDB) {
  /**
   * Register a new user in the company
   */
  app.post('/api/users/register', async (
    request: FastifyRequest<{ Body: RegisterUserRequest & { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId, email, name, roles, responsibilities } = request.body;

    // Check if user already exists
    const existing = db.getUserByEmail(companyId, email);
    if (existing) {
      return reply.status(409).send({ error: 'User already exists' });
    }

    const user = db.createUser(companyId, email, name, roles, responsibilities);

    return reply.status(201).send({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      responsibilities: user.responsibilities,
    });
  });

  /**
   * Login / Connect agent
   */
  app.post('/api/agents/connect', async (
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply
  ) => {
    const { email, companyId } = request.body;

    const user = db.getUserByEmail(companyId, email);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Mark user as online
    db.setUserOnline(user.id, true);

    return reply.send({
      userId: user.id,
      companyId: user.companyId,
      name: user.name,
      roles: user.roles,
      responsibilities: user.responsibilities,
    });
  });

  /**
   * Disconnect agent
   */
  app.post('/api/agents/disconnect', async (
    request: FastifyRequest<{ Body: { userId: string } }>,
    reply: FastifyReply
  ) => {
    const { userId } = request.body;

    db.setUserOnline(userId, false);

    return reply.send({ success: true });
  });

  /**
   * Get all users in company (for routing)
   */
  app.get('/api/users', async (
    request: FastifyRequest<{ Querystring: { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId } = request.query;

    const users = db.getCompanyUsers(companyId);

    return reply.send({
      users: users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: u.roles,
        responsibilities: u.responsibilities,
        isOnline: u.isOnline,
      })),
    });
  });

  /**
   * Get user by ID
   */
  app.get('/api/users/:userId', async (
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) => {
    const { userId } = request.params;

    const user = db.getUser(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      responsibilities: user.responsibilities,
      isOnline: user.isOnline,
    });
  });

  /**
   * Upsert a user — create or update by email.
   * Used by the Slack bot workspace reader to sync profiles into Moltbook.
   */
  app.put('/api/users/upsert', async (
    request: FastifyRequest<{
      Body: RegisterUserRequest & { companyId: string; slackUserId?: string }
    }>,
    reply: FastifyReply
  ) => {
    const { companyId, email, name, roles, responsibilities, slackUserId } = request.body;
    const user = db.upsertUser(companyId, email, name, roles, responsibilities, slackUserId);
    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      responsibilities: user.responsibilities,
      slackUserId: user.slackUserId,
    });
  });

  /**
   * Get user by Slack user ID
   */
  app.get('/api/users/by-slack/:slackId', async (
    request: FastifyRequest<{ Params: { slackId: string }; Querystring: { companyId: string } }>,
    reply: FastifyReply
  ) => {
    const { slackId } = request.params;
    const { companyId } = request.query;
    const user = db.getUserBySlackId(companyId || 'default', slackId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      responsibilities: user.responsibilities,
      slackUserId: user.slackUserId,
      isOnline: user.isOnline,
    });
  });

  /**
   * Find user by responsibility
   */
  app.get('/api/users/by-responsibility', async (
    request: FastifyRequest<{ Querystring: { companyId: string; responsibility: string } }>,
    reply: FastifyReply
  ) => {
    const { companyId, responsibility } = request.query;

    const users = db.getCompanyUsers(companyId);

    // Find users with matching responsibility
    const matches = users.filter(u =>
      u.responsibilities.some(r =>
        r.toLowerCase().includes(responsibility.toLowerCase())
      )
    );

    // Prefer online users
    matches.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return 0;
    });

    return reply.send({
      users: matches.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        responsibilities: u.responsibilities,
        isOnline: u.isOnline,
      })),
    });
  });
}
