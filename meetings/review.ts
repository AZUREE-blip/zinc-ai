/**
 * Review Service
 *
 * Merged from review-service.ts + review-qa-service.ts
 *
 * - ReviewServiceImpl: generates MeetingReview from transcript + analysis
 * - ReviewQAServiceImpl: conversational AI for asking questions about reviews
 */

import type {
  MeetingReview,
  AnalysisInput,
  QAResponse,
  ReviewChatMessage,
} from './types.js';
import { LLMMeetingAnalyzerImpl } from './analyzer.js';

// ============================================
// REVIEW GENERATION
// ============================================

export class ReviewServiceImpl {
  private analyzer = new LLMMeetingAnalyzerImpl();

  async generateReview(input: AnalysisInput): Promise<MeetingReview> {
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const review: MeetingReview = {
      id: reviewId,
      title: input.meetingTitle,
      date: new Date(input.meetingDate).getTime(),
      duration: input.duration,
      platform: input.platform,
      participants: input.participants.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isInternal: true,
      })),
      transcriptSegments: [],
      summary: '',
      executiveSummary: 'Generating review...',
      emotionalOverview: '',
      keyMoments: [],
      actionItems: [],
      promises: [],
      openQuestions: [],
      topics: [],
      participantAnalyses: [],
      overallSentiment: 'neutral',
      sentimentTrajectory: 'stable',
      suggestedFollowUps: [],
      searchableContent: '',
      status: 'generating',
      createdAt: now,
      updatedAt: now,
    };

    try {
      const analysis = await this.analyzer.analyzeMeeting(input);

      review.transcriptSegments = analysis.analyzedSegments;
      review.summary = analysis.summary;
      review.executiveSummary = analysis.executiveSummary;
      review.emotionalOverview = analysis.emotionalOverview;
      review.keyMoments = analysis.keyMoments;
      review.actionItems = analysis.actionItems;
      review.promises = analysis.promises;
      review.openQuestions = analysis.openQuestions;
      review.topics = analysis.topics;
      review.participantAnalyses = analysis.participantAnalyses;
      review.overallSentiment = analysis.overallSentiment;
      review.sentimentTrajectory = analysis.sentimentTrajectory;
      review.suggestedFollowUps = analysis.suggestedFollowUps;
      review.status = 'ready';
      review.generatedAt = Date.now();
      review.searchableContent = this.buildSearchableContent(review);
      review.updatedAt = Date.now();
    } catch (err: any) {
      console.error('Review generation failed:', err.message);
      review.status = 'error';
      review.errorMessage = err.message;
      review.updatedAt = Date.now();
    }

    return review;
  }

  private buildSearchableContent(review: MeetingReview): string {
    const parts: string[] = [
      review.title,
      review.summary,
      review.executiveSummary,
      review.emotionalOverview,
    ];

    for (const p of review.participants) {
      parts.push(p.name);
      if (p.role) parts.push(p.role);
    }

    for (const seg of review.transcriptSegments) {
      parts.push(`${seg.speakerName}: ${seg.text}`);
    }

    for (const km of review.keyMoments) {
      parts.push(km.title);
      parts.push(km.description);
    }

    for (const ai of review.actionItems) {
      parts.push(ai.description);
      if (ai.assignee) parts.push(ai.assignee);
    }

    for (const t of review.topics) {
      parts.push(t.topic);
      parts.push(t.summary);
    }

    return parts.filter(Boolean).join(' ');
  }
}

// ============================================
// REVIEW Q&A (conversational AI about meetings)
// ============================================

export class ReviewQAServiceImpl {

  async query(
    review: MeetingReview,
    question: string,
    conversationHistory: ReviewChatMessage[] = []
  ): Promise<QAResponse> {
    const contextPrompt = this.buildReviewContext(review);

    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
    messages.push({ role: 'user' as const, content: question });

    const systemPrompt = `You are an expert meeting analyst. You have access to a complete meeting review with transcript, emotional analysis, and participant behavior data.

${contextPrompt}

Answer the user's question based on this meeting data. Be specific:
- Cite timestamps when referring to specific moments
- Reference speaker names and their emotional states
- If asked about someone's behavior, use the participant analysis data
- If asked to draft something (email, message), use the meeting context
- If asked about disagreements or tensions, reference the key moments and sentiment data

Keep answers concise but thorough. If the data doesn't contain enough information to answer, say so.

At the end of your answer, suggest 2-3 follow-up questions the user might want to ask.
Format your response as JSON:
{
  "answer": "Your detailed answer here",
  "references": [
    {"type": "transcript|key_moment|action_item|participant_analysis", "id": "id", "preview": "brief excerpt", "timestamp": 120}
  ],
  "suggestedFollowUps": ["Question 1?", "Question 2?", "Question 3?"]
}`;

    try {
      const { generateJson } = await import('../server/ai-service');
      const userPrompt = messages.length > 1
        ? `Previous conversation:\n${messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nNew question: ${question}`
        : question;

      const result = await generateJson(userPrompt, {
        systemPrompt,
        maxTokens: 2048,
      });

      if (result.success && result.data) {
        return {
          answer: result.data.answer || result.raw || 'Unable to analyze.',
          references: result.data.references || [],
          conversationId: `conv-${Date.now()}`,
          suggestedFollowUps: result.data.suggestedFollowUps || this.getSuggestedQuestions(review),
        };
      }

      if (result.success && result.raw) {
        return {
          answer: result.raw,
          references: [],
          conversationId: `conv-${Date.now()}`,
          suggestedFollowUps: this.getSuggestedQuestions(review),
        };
      }

      throw new Error(result.error || 'AI returned no response');
    } catch (err: any) {
      console.error('Review Q&A failed:', err.message);
      return {
        answer: `I'm unable to analyze this review right now. Error: ${err.message}. Please check your AI provider settings.`,
        references: [],
        conversationId: `conv-${Date.now()}`,
        suggestedFollowUps: this.getSuggestedQuestions(review),
      };
    }
  }

  getSuggestedQuestions(review: MeetingReview): string[] {
    const questions: string[] = [];

    if (review.participants.length > 1) {
      questions.push(`Who was the most engaged participant?`);
      questions.push(`Were there any disagreements or tensions?`);
    }

    if (review.actionItems.length > 0) {
      questions.push(`Summarize all action items and who's responsible`);
    }

    if (review.keyMoments.length > 0) {
      questions.push(`What were the key decisions made?`);
    }

    if (review.participants.length > 0) {
      const name = review.participants[0]?.name;
      if (name) {
        questions.push(`How did ${name} contribute to the meeting?`);
      }
    }

    questions.push(`Draft a follow-up email summarizing this meeting`);
    questions.push(`What should we focus on before the next meeting?`);

    return questions.slice(0, 5);
  }

  private buildReviewContext(review: MeetingReview): string {
    let context = `MEETING REVIEW DATA:
Title: ${review.title}
Date: ${new Date(review.date).toLocaleDateString()}
Duration: ${Math.round(review.duration / 60)} minutes
Platform: ${review.platform}
Overall Sentiment: ${review.overallSentiment} (${review.sentimentTrajectory})

Participants: ${review.participants.map(p => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}

Executive Summary: ${review.executiveSummary}

Emotional Overview: ${review.emotionalOverview}

Full Summary: ${review.summary}`;

    if (review.transcriptSegments.length > 0) {
      const maxSegments = Math.min(review.transcriptSegments.length, 200);
      context += '\n\nTRANSCRIPT (with emotional analysis):';
      for (let i = 0; i < maxSegments; i++) {
        const seg = review.transcriptSegments[i];
        const time = this.formatTime(seg.startTime);
        context += `\n[${time}] ${seg.speakerName} (${seg.primaryEmotion}): ${seg.text}`;
        if (seg.interpretation) {
          context += ` [AI interpretation: ${seg.interpretation}]`;
        }
      }
      if (review.transcriptSegments.length > maxSegments) {
        context += `\n... (${review.transcriptSegments.length - maxSegments} more segments)`;
      }
    }

    if (review.keyMoments.length > 0) {
      context += '\n\nKEY MOMENTS:';
      for (const km of review.keyMoments) {
        context += `\n- [${this.formatTime(km.timestamp)}] ${km.type.toUpperCase()}: ${km.title} - ${km.description} (Impact: ${km.impact}, Speakers: ${km.speakers.join(', ')})`;
      }
    }

    if (review.actionItems.length > 0) {
      context += '\n\nACTION ITEMS:';
      for (const ai of review.actionItems) {
        context += `\n- ${ai.description}${ai.assignee ? ` [Assigned to: ${ai.assignee}]` : ''}${ai.deadline ? ` [Deadline: ${ai.deadline}]` : ''} (Priority: ${ai.priority})`;
      }
    }

    if (review.promises.length > 0) {
      context += '\n\nPROMISES MADE:';
      for (const p of review.promises) {
        context += `\n- ${p.speaker} promised: ${p.promise}${p.toWhom ? ` (to ${p.toWhom})` : ''}`;
      }
    }

    if (review.participantAnalyses.length > 0) {
      context += '\n\nPARTICIPANT ANALYSES:';
      for (const pa of review.participantAnalyses) {
        context += `\n\n${pa.name}:
  Speaking: ${pa.speakingPercentage}% of meeting (${pa.wordCount} words)
  Dominant emotion: ${pa.dominantEmotion}
  Engagement: ${pa.engagementLevel}
  Communication style: ${pa.communicationStyle}
  Behavior notes: ${pa.behaviorNotes}
  Key contributions: ${pa.keyContributions.join(', ') || 'None noted'}
  Expressions: ${pa.expressionsSummary}`;
      }
    }

    if (review.openQuestions.length > 0) {
      context += '\n\nOPEN QUESTIONS (unanswered):';
      for (const oq of review.openQuestions) {
        context += `\n- ${oq.askedBy}: "${oq.question}" [${oq.addressed ? 'Addressed' : 'Still open'}]`;
      }
    }

    if (review.topics.length > 0) {
      context += '\n\nTOPICS DISCUSSED:';
      for (const t of review.topics) {
        context += `\n- ${t.topic} (${t.timeSpentPercentage}% of meeting, sentiment: ${t.sentiment}): ${t.summary}`;
      }
    }

    return context;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
