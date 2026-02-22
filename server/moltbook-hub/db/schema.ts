/**
 * Moltbook Hub - Database Schema
 *
 * Using SQLite for simplicity (easy to self-host).
 * Can migrate to PostgreSQL for larger deployments.
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  Company,
  User,
  Agent,
  Knowledge,
  RoutingRule,
  ContextUpload,
  Suggestion,
  Outcome,
  Category,
} from '../types';

export class MoltbookDB {
  private db: Database.Database;

  constructor(dbPath: string = './moltbook.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    // Companies table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        hub_url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        roles TEXT NOT NULL,
        responsibilities TEXT NOT NULL,
        slack_user_id TEXT,
        is_online INTEGER DEFAULT 0,
        last_seen INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        UNIQUE(company_id, email)
      )
    `);

    // Migration: add slack_user_id column if missing (existing databases)
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN slack_user_id TEXT`);
    } catch {
      // Column already exists — ignore
    }

    // Agents table (connected local AIs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        is_connected INTEGER DEFAULT 0,
        last_ping INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    // Knowledge table (shared learnings)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        situation TEXT NOT NULL,
        keywords TEXT NOT NULL,
        action_type TEXT NOT NULL,
        solution TEXT NOT NULL,
        steps TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      )
    `);

    // Routing rules table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS routing_rules (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        keywords TEXT NOT NULL,
        action_types TEXT NOT NULL,
        assigned_user_id TEXT NOT NULL,
        assigned_role TEXT,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (assigned_user_id) REFERENCES users(id)
      )
    `);

    // Context uploads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_uploads (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        people TEXT NOT NULL,
        action_type TEXT NOT NULL,
        keywords TEXT NOT NULL,
        summary TEXT NOT NULL,
        urgency TEXT NOT NULL,
        target_user_id TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_user_id) REFERENCES users(id)
      )
    `);

    // Suggestions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        from_context_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        short_text TEXT NOT NULL,
        full_text TEXT NOT NULL,
        action_type TEXT NOT NULL,
        primary_action TEXT NOT NULL,
        secondary_actions TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_context_id) REFERENCES context_uploads(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      )
    `);

    // Outcomes table (for learning)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        was_successful INTEGER,
        edited_text TEXT,
        feedback TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Categories table (company compartments)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '[]',
        parent_id TEXT,
        item_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (parent_id) REFERENCES categories(id),
        UNIQUE(company_id, name)
      )
    `);

    // Migration: add category_id to knowledge and context_uploads
    try { this.db.exec(`ALTER TABLE knowledge ADD COLUMN category_id TEXT`); } catch { /* exists */ }
    try { this.db.exec(`ALTER TABLE context_uploads ADD COLUMN category_id TEXT`); } catch { /* exists */ }

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge(company_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_keywords ON knowledge(keywords);
      CREATE INDEX IF NOT EXISTS idx_routing_company ON routing_rules(company_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_to_user ON suggestions(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_outcomes_suggestion ON outcomes(suggestion_id);
      CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(company_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category_id);
      CREATE INDEX IF NOT EXISTS idx_context_category ON context_uploads(category_id);
    `);
  }

  // ============================================
  // COMPANY OPERATIONS
  // ============================================

  createCompany(name: string, hubUrl: string): Company {
    const company: Company = {
      id: uuid(),
      name,
      hubUrl,
      createdAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO companies (id, name, hub_url, created_at)
      VALUES (?, ?, ?, ?)
    `).run(company.id, company.name, company.hubUrl, company.createdAt);

    return company;
  }

  getCompany(id: string): Company | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      hubUrl: row.hub_url,
      createdAt: row.created_at,
    };
  }

  // ============================================
  // USER OPERATIONS
  // ============================================

  createUser(companyId: string, email: string, name: string, roles: string[], responsibilities: string[]): User {
    const user: User = {
      id: uuid(),
      companyId,
      email,
      name,
      roles,
      responsibilities,
      isOnline: false,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO users (id, company_id, email, name, roles, responsibilities, is_online, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.companyId,
      user.email,
      user.name,
      JSON.stringify(user.roles),
      JSON.stringify(user.responsibilities),
      user.isOnline ? 1 : 0,
      user.lastSeen,
      user.createdAt
    );

    return user;
  }

  getUser(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;

    return this.rowToUser(row);
  }

  getUserByEmail(companyId: string, email: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE company_id = ? AND email = ?').get(companyId, email) as any;
    if (!row) return null;

    return this.rowToUser(row);
  }

  getCompanyUsers(companyId: string): User[] {
    const rows = this.db.prepare('SELECT * FROM users WHERE company_id = ?').all(companyId) as any[];
    return rows.map(this.rowToUser);
  }

  setUserOnline(userId: string, isOnline: boolean): void {
    this.db.prepare(`
      UPDATE users SET is_online = ?, last_seen = ? WHERE id = ?
    `).run(isOnline ? 1 : 0, Date.now(), userId);
  }

  /**
   * Upsert a user — create if not exists, update if already exists.
   * Used by the Slack bot workspace reader to sync Slack profiles into Moltbook.
   */
  upsertUser(
    companyId: string,
    email: string,
    name: string,
    roles: string[],
    responsibilities: string[],
    slackUserId?: string
  ): User {
    const existing = this.getUserByEmail(companyId, email);
    if (existing) {
      this.db.prepare(`
        UPDATE users SET name = ?, roles = ?, responsibilities = ?, slack_user_id = ?, last_seen = ?
        WHERE company_id = ? AND email = ?
      `).run(
        name,
        JSON.stringify(roles),
        JSON.stringify(responsibilities),
        slackUserId || existing.slackUserId || null,
        Date.now(),
        companyId,
        email
      );
      return {
        ...existing,
        name,
        roles,
        responsibilities,
        slackUserId: slackUserId || existing.slackUserId,
        lastSeen: Date.now(),
      };
    }

    const user: User = {
      id: uuid(),
      companyId,
      email,
      name,
      roles,
      responsibilities,
      slackUserId: slackUserId || undefined,
      isOnline: false,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO users (id, company_id, email, name, roles, responsibilities, slack_user_id, is_online, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, user.companyId, user.email, user.name,
      JSON.stringify(user.roles), JSON.stringify(user.responsibilities),
      user.slackUserId || null, 0, user.lastSeen, user.createdAt
    );

    return user;
  }

  getUserBySlackId(companyId: string, slackUserId: string): User | null {
    const row = this.db.prepare(
      'SELECT * FROM users WHERE company_id = ? AND slack_user_id = ?'
    ).get(companyId, slackUserId) as any;
    if (!row) return null;
    return this.rowToUser(row);
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      name: row.name,
      roles: JSON.parse(row.roles),
      responsibilities: JSON.parse(row.responsibilities),
      slackUserId: row.slack_user_id || undefined,
      isOnline: row.is_online === 1,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    };
  }

  // ============================================
  // KNOWLEDGE OPERATIONS
  // ============================================

  addKnowledge(
    companyId: string,
    userId: string,
    situation: string,
    keywords: string[],
    actionType: string,
    solution: string,
    steps?: string[]
  ): Knowledge {
    const knowledge: Knowledge = {
      id: uuid(),
      companyId,
      createdByUserId: userId,
      situation,
      keywords,
      actionType,
      solution,
      steps,
      successCount: 0,
      failureCount: 0,
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO knowledge (id, company_id, created_by_user_id, situation, keywords, action_type, solution, steps, success_count, failure_count, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      knowledge.id,
      knowledge.companyId,
      knowledge.createdByUserId,
      knowledge.situation,
      JSON.stringify(knowledge.keywords),
      knowledge.actionType,
      knowledge.solution,
      knowledge.steps ? JSON.stringify(knowledge.steps) : null,
      knowledge.successCount,
      knowledge.failureCount,
      knowledge.lastUsedAt,
      knowledge.createdAt
    );

    return knowledge;
  }

  searchKnowledge(companyId: string, keywords: string[], actionType?: string): Knowledge[] {
    // Search by keywords (simple LIKE matching)
    const keywordPattern = keywords.map(k => `%${k}%`).join('%');

    let query = 'SELECT * FROM knowledge WHERE company_id = ? AND keywords LIKE ?';
    const params: any[] = [companyId, keywordPattern];

    if (actionType) {
      query += ' AND action_type = ?';
      params.push(actionType);
    }

    query += ' ORDER BY success_count DESC, last_used_at DESC LIMIT 10';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(this.rowToKnowledge);
  }

  updateKnowledgeStats(knowledgeId: string, wasSuccessful: boolean): void {
    const field = wasSuccessful ? 'success_count' : 'failure_count';
    this.db.prepare(`
      UPDATE knowledge SET ${field} = ${field} + 1, last_used_at = ? WHERE id = ?
    `).run(Date.now(), knowledgeId);
  }

  private rowToKnowledge(row: any): Knowledge {
    return {
      id: row.id,
      companyId: row.company_id,
      createdByUserId: row.created_by_user_id,
      situation: row.situation,
      keywords: JSON.parse(row.keywords),
      actionType: row.action_type,
      solution: row.solution,
      steps: row.steps ? JSON.parse(row.steps) : undefined,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    };
  }

  // ============================================
  // ROUTING OPERATIONS
  // ============================================

  addRoutingRule(
    companyId: string,
    keywords: string[],
    actionTypes: string[],
    assignedUserId: string,
    assignedRole?: string
  ): RoutingRule {
    const rule: RoutingRule = {
      id: uuid(),
      companyId,
      keywords,
      actionTypes,
      assignedUserId,
      assignedRole,
      confidence: 0.5,
      usageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO routing_rules (id, company_id, keywords, action_types, assigned_user_id, assigned_role, confidence, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id,
      rule.companyId,
      JSON.stringify(rule.keywords),
      JSON.stringify(rule.actionTypes),
      rule.assignedUserId,
      rule.assignedRole || null,
      rule.confidence,
      rule.usageCount,
      rule.createdAt,
      rule.updatedAt
    );

    return rule;
  }

  findRoutingRule(companyId: string, keywords: string[], actionType: string): RoutingRule | null {
    // Find best matching rule
    const rules = this.db.prepare(`
      SELECT * FROM routing_rules
      WHERE company_id = ? AND action_types LIKE ?
      ORDER BY confidence DESC, usage_count DESC
    `).all(companyId, `%${actionType}%`) as any[];

    // Score each rule by keyword match
    let bestRule: any = null;
    let bestScore = 0;

    for (const rule of rules) {
      const ruleKeywords = JSON.parse(rule.keywords) as string[];
      const matchCount = keywords.filter(k =>
        ruleKeywords.some(rk => rk.toLowerCase().includes(k.toLowerCase()))
      ).length;

      const score = matchCount * rule.confidence;
      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    if (!bestRule) return null;

    return {
      id: bestRule.id,
      companyId: bestRule.company_id,
      keywords: JSON.parse(bestRule.keywords),
      actionTypes: JSON.parse(bestRule.action_types),
      assignedUserId: bestRule.assigned_user_id,
      assignedRole: bestRule.assigned_role,
      confidence: bestRule.confidence,
      usageCount: bestRule.usage_count,
      createdAt: bestRule.created_at,
      updatedAt: bestRule.updated_at,
    };
  }

  updateRoutingConfidence(ruleId: string, wasSuccessful: boolean): void {
    // Adjust confidence based on outcome
    const adjustment = wasSuccessful ? 0.05 : -0.05;
    this.db.prepare(`
      UPDATE routing_rules
      SET confidence = MIN(1.0, MAX(0.1, confidence + ?)),
          usage_count = usage_count + 1,
          updated_at = ?
      WHERE id = ?
    `).run(adjustment, Date.now(), ruleId);
  }

  // ============================================
  // SUGGESTION OPERATIONS
  // ============================================

  createSuggestion(
    companyId: string,
    fromContextId: string,
    fromUserId: string,
    toUserId: string,
    shortText: string,
    fullText: string,
    actionType: string,
    primaryAction: string,
    secondaryActions: string[]
  ): Suggestion {
    const suggestion: Suggestion = {
      id: uuid(),
      companyId,
      fromContextId,
      fromUserId,
      toUserId,
      shortText,
      fullText,
      actionType,
      primaryAction,
      secondaryActions,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.db.prepare(`
      INSERT INTO suggestions (id, company_id, from_context_id, from_user_id, to_user_id, short_text, full_text, action_type, primary_action, secondary_actions, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      suggestion.id,
      suggestion.companyId,
      suggestion.fromContextId,
      suggestion.fromUserId,
      suggestion.toUserId,
      suggestion.shortText,
      suggestion.fullText,
      suggestion.actionType,
      suggestion.primaryAction,
      JSON.stringify(suggestion.secondaryActions),
      suggestion.status,
      suggestion.createdAt,
      suggestion.expiresAt
    );

    return suggestion;
  }

  getPendingSuggestions(userId: string): Suggestion[] {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM suggestions
      WHERE to_user_id = ? AND status IN ('pending', 'shown') AND expires_at > ?
      ORDER BY created_at DESC
    `).all(userId, now) as any[];

    return rows.map(this.rowToSuggestion);
  }

  updateSuggestionStatus(suggestionId: string, status: Suggestion['status']): void {
    this.db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, suggestionId);
  }

  private rowToSuggestion(row: any): Suggestion {
    return {
      id: row.id,
      companyId: row.company_id,
      fromContextId: row.from_context_id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      shortText: row.short_text,
      fullText: row.full_text,
      actionType: row.action_type,
      primaryAction: row.primary_action,
      secondaryActions: JSON.parse(row.secondary_actions),
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  // ============================================
  // OUTCOME OPERATIONS
  // ============================================

  recordOutcome(
    suggestionId: string,
    companyId: string,
    userId: string,
    action: Outcome['action'],
    wasSuccessful?: boolean,
    editedText?: string,
    feedback?: string
  ): Outcome {
    const outcome: Outcome = {
      id: uuid(),
      suggestionId,
      companyId,
      userId,
      action,
      wasSuccessful,
      editedText,
      feedback,
      timestamp: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO outcomes (id, suggestion_id, company_id, user_id, action, was_successful, edited_text, feedback, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      outcome.id,
      outcome.suggestionId,
      outcome.companyId,
      outcome.userId,
      outcome.action,
      outcome.wasSuccessful !== undefined ? (outcome.wasSuccessful ? 1 : 0) : null,
      outcome.editedText || null,
      outcome.feedback || null,
      outcome.timestamp
    );

    // Update suggestion status
    this.updateSuggestionStatus(suggestionId, action === 'accepted' ? 'accepted' : 'rejected');

    return outcome;
  }

  // ============================================
  // CONTEXT OPERATIONS
  // ============================================

  saveContext(
    companyId: string,
    fromUserId: string,
    people: string[],
    actionType: string,
    keywords: string[],
    summary: string,
    urgency: ContextUpload['urgency'],
    targetUserId?: string
  ): ContextUpload {
    const context: ContextUpload = {
      id: uuid(),
      companyId,
      fromUserId,
      people,
      actionType,
      keywords,
      summary,
      urgency,
      targetUserId,
      timestamp: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO context_uploads (id, company_id, from_user_id, people, action_type, keywords, summary, urgency, target_user_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.id,
      context.companyId,
      context.fromUserId,
      JSON.stringify(context.people),
      context.actionType,
      JSON.stringify(context.keywords),
      context.summary,
      context.urgency,
      context.targetUserId || null,
      context.timestamp
    );

    return context;
  }

  // ============================================
  // CATEGORY OPERATIONS (Company compartments)
  // ============================================

  /**
   * Create or get a category. If it already exists, returns the existing one.
   * AI calls this to auto-create compartments as it discovers what the company does.
   */
  getOrCreateCategory(
    companyId: string,
    name: string,
    description: string = '',
    keywords: string[] = [],
    parentId?: string
  ): Category {
    // Check if exists
    const existing = this.db.prepare(
      'SELECT * FROM categories WHERE company_id = ? AND name = ?'
    ).get(companyId, name) as any;

    if (existing) {
      // Update keywords if new ones provided (merge)
      if (keywords.length > 0) {
        const existingKeywords = JSON.parse(existing.keywords) as string[];
        const merged = [...new Set([...existingKeywords, ...keywords])];
        this.db.prepare(
          'UPDATE categories SET keywords = ?, updated_at = ? WHERE id = ?'
        ).run(JSON.stringify(merged), Date.now(), existing.id);
      }
      return this.rowToCategory(existing);
    }

    const category: Category = {
      id: uuid(),
      companyId,
      name,
      description,
      keywords,
      parentId,
      itemCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO categories (id, company_id, name, description, keywords, parent_id, item_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category.id, category.companyId, category.name, category.description,
      JSON.stringify(category.keywords), category.parentId || null,
      category.itemCount, category.createdAt, category.updatedAt
    );

    return category;
  }

  getCompanyCategories(companyId: string): Category[] {
    const rows = this.db.prepare(
      'SELECT * FROM categories WHERE company_id = ? ORDER BY item_count DESC'
    ).all(companyId) as any[];
    return rows.map(this.rowToCategory);
  }

  getCategoryChildren(categoryId: string): Category[] {
    const rows = this.db.prepare(
      'SELECT * FROM categories WHERE parent_id = ? ORDER BY item_count DESC'
    ).all(categoryId) as any[];
    return rows.map(this.rowToCategory);
  }

  /**
   * Find the best matching category for given keywords.
   * Returns null if no good match — caller should create a new one.
   */
  findMatchingCategory(companyId: string, keywords: string[]): Category | null {
    const categories = this.getCompanyCategories(companyId);
    if (categories.length === 0) return null;

    let bestMatch: Category | null = null;
    let bestScore = 0;

    for (const cat of categories) {
      let score = 0;
      const catKeywords = cat.keywords.map(k => k.toLowerCase());
      const catName = cat.name.toLowerCase();

      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        // Exact keyword match
        if (catKeywords.includes(kwLower)) score += 2;
        // Partial keyword match
        else if (catKeywords.some(ck => ck.includes(kwLower) || kwLower.includes(ck))) score += 1;
        // Name match
        if (catName.includes(kwLower) || kwLower.includes(catName)) score += 1.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }

    // Require at least a minimal match
    return bestScore >= 1.5 ? bestMatch : null;
  }

  /**
   * Assign a context upload to a category and bump the count.
   */
  assignContextToCategory(contextId: string, categoryId: string): void {
    this.db.prepare('UPDATE context_uploads SET category_id = ? WHERE id = ?').run(categoryId, contextId);
    this.db.prepare('UPDATE categories SET item_count = item_count + 1, updated_at = ? WHERE id = ?').run(Date.now(), categoryId);
  }

  /**
   * Assign knowledge to a category and bump the count.
   */
  assignKnowledgeToCategory(knowledgeId: string, categoryId: string): void {
    this.db.prepare('UPDATE knowledge SET category_id = ? WHERE id = ?').run(categoryId, knowledgeId);
    this.db.prepare('UPDATE categories SET item_count = item_count + 1, updated_at = ? WHERE id = ?').run(Date.now(), categoryId);
  }

  /**
   * Search knowledge within a specific category.
   */
  searchKnowledgeByCategory(companyId: string, categoryId: string, keywords?: string[]): Knowledge[] {
    let query = 'SELECT * FROM knowledge WHERE company_id = ? AND category_id = ?';
    const params: any[] = [companyId, categoryId];

    if (keywords && keywords.length > 0) {
      const pattern = keywords.map(k => `%${k}%`).join('%');
      query += ' AND keywords LIKE ?';
      params.push(pattern);
    }

    query += ' ORDER BY success_count DESC, last_used_at DESC LIMIT 20';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(this.rowToKnowledge);
  }

  private rowToCategory(row: any): Category {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      description: row.description,
      keywords: JSON.parse(row.keywords),
      parentId: row.parent_id || undefined,
      itemCount: row.item_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- PRIVACY: Data Retention Cleanup ---
  // Deletes expired data to prevent accumulation of sensitive context
  cleanupExpiredData(config: { contextDays: number; suggestionDays: number; outcomeDays: number }): void {
    const now = Date.now();
    const contextCutoff = now - (config.contextDays * 24 * 60 * 60 * 1000);
    const suggestionCutoff = now - (config.suggestionDays * 24 * 60 * 60 * 1000);
    const outcomeCutoff = now - (config.outcomeDays * 24 * 60 * 60 * 1000);

    const contextResult = this.db.prepare('DELETE FROM context_uploads WHERE timestamp < ?').run(contextCutoff);
    const suggestionResult = this.db.prepare('DELETE FROM suggestions WHERE created_at < ?').run(suggestionCutoff);
    const outcomeResult = this.db.prepare('DELETE FROM outcomes WHERE timestamp < ?').run(outcomeCutoff);

    const total = (contextResult.changes || 0) + (suggestionResult.changes || 0) + (outcomeResult.changes || 0);
    if (total > 0) {
      console.log(`[PRIVACY] Cleaned up ${total} expired records (${contextResult.changes} contexts, ${suggestionResult.changes} suggestions, ${outcomeResult.changes} outcomes)`);
    }
  }

  close(): void {
    this.db.close();
  }
}
