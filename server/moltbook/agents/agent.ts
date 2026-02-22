/**
 * User Agent - Each user has one AI agent in the circuit
 *
 * Agents:
 * - Observe what their user sees
 * - Upload context to the circuit
 * - Receive suggestions routed to them
 * - Learn from outcomes
 */

import { v4 as uuid } from 'uuid';
import type {
  Agent,
  ActionType,
  SafeContext,
  Suggestion,
  Knowledge,
  SuggestionStatus,
} from '../types';

export class UserAgent implements Agent {
  id: string;
  userId: string;
  companyId: string;
  responsibilities: ActionType[];
  roles: string[];
  isOnline: boolean;
  lastSeen: number;
  suggestionsAccepted: number;
  suggestionsSkipped: number;
  averageResponseTime: number;

  // In-memory state (would be persisted in production)
  private pendingSuggestions: Map<string, Suggestion> = new Map();
  private knowledge: Map<string, Knowledge> = new Map();
  private recentContexts: SafeContext[] = [];

  constructor(params: {
    userId: string;
    companyId: string;
    responsibilities: ActionType[];
    roles: string[];
  }) {
    this.id = uuid();
    this.userId = params.userId;
    this.companyId = params.companyId;
    this.responsibilities = params.responsibilities;
    this.roles = params.roles;
    this.isOnline = false;
    this.lastSeen = Date.now();
    this.suggestionsAccepted = 0;
    this.suggestionsSkipped = 0;
    this.averageResponseTime = 0;
  }

  /**
   * Mark agent as online (user opened the app)
   */
  goOnline(): void {
    this.isOnline = true;
    this.lastSeen = Date.now();
  }

  /**
   * Mark agent as offline (user closed the app)
   */
  goOffline(): void {
    this.isOnline = false;
    this.lastSeen = Date.now();
  }

  /**
   * Check if agent handles a specific action type
   */
  handlesAction(action: ActionType): boolean {
    return this.responsibilities.includes(action);
  }

  /**
   * Check if agent has a specific role
   */
  hasRole(role: string): boolean {
    return this.roles.includes(role.toLowerCase());
  }

  /**
   * Add context from screen capture / input
   * Keep only recent contexts for memory efficiency
   */
  addContext(context: SafeContext): void {
    this.recentContexts.push(context);

    // Keep only last 100 contexts
    if (this.recentContexts.length > 100) {
      this.recentContexts = this.recentContexts.slice(-100);
    }

    this.lastSeen = Date.now();
  }

  /**
   * Add a suggestion routed to this agent
   */
  addSuggestion(suggestion: Suggestion): void {
    this.pendingSuggestions.set(suggestion.id, suggestion);
  }

  /**
   * Get all pending suggestions
   */
  getPendingSuggestions(): Suggestion[] {
    const now = Date.now();
    const suggestions: Suggestion[] = [];

    for (const [id, suggestion] of this.pendingSuggestions) {
      // Check if expired
      if (suggestion.expiresAt < now) {
        suggestion.status = 'expired' as SuggestionStatus;
        this.pendingSuggestions.delete(id);
        continue;
      }

      if (suggestion.status === 'pending' || suggestion.status === 'shown') {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Get the most recent/urgent suggestion for display
   */
  getCurrentSuggestion(): Suggestion | null {
    const pending = this.getPendingSuggestions();
    if (pending.length === 0) return null;

    // Sort by urgency then by timestamp
    pending.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.createdAt - a.createdAt; // Newer first
    });

    return pending[0];
  }

  /**
   * Mark a suggestion as shown to user
   */
  markSuggestionShown(suggestionId: string): void {
    const suggestion = this.pendingSuggestions.get(suggestionId);
    if (suggestion) {
      suggestion.status = 'shown' as SuggestionStatus;
    }
  }

  /**
   * Handle user response to suggestion
   */
  handleSuggestionResponse(
    suggestionId: string,
    action: 'accepted' | 'edited' | 'skipped',
    responseTimeMs: number
  ): void {
    const suggestion = this.pendingSuggestions.get(suggestionId);
    if (!suggestion) return;

    suggestion.status = action as SuggestionStatus;

    // Update stats
    if (action === 'accepted' || action === 'edited') {
      this.suggestionsAccepted++;
    } else {
      this.suggestionsSkipped++;
    }

    // Update average response time
    const total = this.suggestionsAccepted + this.suggestionsSkipped;
    this.averageResponseTime =
      (this.averageResponseTime * (total - 1) + responseTimeMs) / total;

    // Remove from pending
    this.pendingSuggestions.delete(suggestionId);
  }

  /**
   * Add knowledge learned from successful outcome
   */
  addKnowledge(knowledge: Knowledge): void {
    this.knowledge.set(knowledge.id, knowledge);
  }

  /**
   * Find relevant knowledge for a context
   */
  findRelevantKnowledge(
    actions: ActionType[],
    topics: string[]
  ): Knowledge[] {
    const relevant: Knowledge[] = [];

    for (const knowledge of this.knowledge.values()) {
      // Check action match
      const actionMatch = knowledge.triggerActions.some((a) =>
        actions.includes(a)
      );

      // Check topic match
      const topicMatch = knowledge.triggerTopics.some((t) =>
        topics.some((topic) => topic.toLowerCase().includes(t.toLowerCase()))
      );

      if (actionMatch || topicMatch) {
        relevant.push(knowledge);
      }
    }

    // Sort by success rate
    relevant.sort((a, b) => b.successRate - a.successRate);

    return relevant;
  }

  /**
   * Get agent state for serialization
   */
  toJSON(): Agent {
    return {
      id: this.id,
      userId: this.userId,
      companyId: this.companyId,
      responsibilities: this.responsibilities,
      roles: this.roles,
      isOnline: this.isOnline,
      lastSeen: this.lastSeen,
      suggestionsAccepted: this.suggestionsAccepted,
      suggestionsSkipped: this.suggestionsSkipped,
      averageResponseTime: this.averageResponseTime,
    };
  }
}
