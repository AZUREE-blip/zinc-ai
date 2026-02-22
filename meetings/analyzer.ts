/**
 * LLM Meeting Analyzer
 *
 * Uses Claude or OpenAI to analyze meeting transcripts and produce:
 * - Per-segment emotional tone analysis
 * - Intent classification
 * - Key moment detection
 * - Action items extraction
 * - Promise tracking
 * - Per-person sentiment and behavior analysis
 *
 * This is the "brain" that turns raw transcripts + visual data
 * into rich meeting intelligence.
 */

import type {
  IntentType,
  AnalysisInput,
  FullAnalysisResult,
  ReviewTranscriptSegment,
  ReviewParticipantAnalysis,
} from './types.js';

export class LLMMeetingAnalyzerImpl {

  async analyzeMeeting(input: AnalysisInput): Promise<FullAnalysisResult> {
    const transcriptText = input.transcriptSegments.map(seg => {
      const time = this.formatTime(seg.startTime);
      return `[${time}] ${seg.speakerName}: ${seg.text}`;
    }).join('\n');

    let expressionContext = '';
    if (input.expressionData && input.expressionData.length > 0) {
      expressionContext = '\n\nVisual Expression Data (from face detection):\n' +
        input.expressionData.map(e =>
          `[${this.formatTime(e.timestamp)}] ${e.participantName}: ${e.expression} (confidence: ${(e.confidence * 100).toFixed(0)}%)`
        ).join('\n');
    }

    const participantList = input.participants.map(p =>
      `- ${p.name}${p.role ? ` (${p.role})` : ''}`
    ).join('\n');

    const prompt = `Analyze this meeting transcript and provide a comprehensive review.

Meeting: ${input.meetingTitle}
Date: ${input.meetingDate}
Duration: ${Math.round(input.duration / 60)} minutes
Platform: ${input.platform}
Participants:
${participantList}

TRANSCRIPT:
${transcriptText}
${expressionContext}

Provide your analysis as JSON with this exact structure:
{
  "summary": "2-3 paragraph summary of the meeting",
  "executiveSummary": "1-2 sentence executive summary",
  "emotionalOverview": "Overview of emotional dynamics - who was engaged, frustrated, etc.",
  "overallSentiment": "one of: positive, negative, neutral, mixed",
  "sentimentTrajectory": "one of: improving, stable, declining",
  "analyzedSegments": [
    {
      "id": "seg-0",
      "speakerId": "speaker-name",
      "speakerName": "Name",
      "text": "what they said",
      "startTime": 0,
      "endTime": 10,
      "primaryEmotion": "neutral|happy|excited|frustrated|confused|skeptical|sarcastic|serious|urgent|hesitant|confident|defensive|worried|annoyed|disappointed|enthusiastic|satisfied",
      "emotionConfidence": 0.8,
      "flags": [{"type": "sarcasm|hesitation|frustration|excitement|disagreement|agreement|confusion|urgency", "confidence": 0.7}],
      "intent": "statement|question|request|promise|concern|objection|agreement|disagreement|suggestion|decision",
      "interpretation": "What they really meant",
      "isKeyMoment": false,
      "keyMomentReason": null
    }
  ],
  "keyMoments": [{"id": "km-0", "timestamp": 120, "type": "decision|commitment|concern|breakthrough|tension|agreement|disagreement", "title": "Short title", "description": "What happened", "speakers": ["Name1"], "impact": "high|medium|low"}],
  "actionItems": [{"id": "ai-0", "description": "What needs to be done", "assignee": "Person", "deadline": "date if mentioned", "priority": "high|medium|low", "confidence": 0.9, "sourceTimestamp": 300, "status": "pending"}],
  "promises": [{"id": "p-0", "speaker": "Who", "promise": "What", "toWhom": "To whom", "deadline": "When", "confidence": 0.85, "sourceTimestamp": 400}],
  "openQuestions": [{"id": "oq-0", "question": "The question", "askedBy": "Who", "timestamp": 500, "addressed": false}],
  "topics": [{"id": "t-0", "topic": "Topic", "timeSpentSeconds": 180, "timeSpentPercentage": 25, "sentiment": "positive|negative|neutral|mixed", "participants": ["Name1"], "summary": "Brief summary"}],
  "participantAnalyses": [{"participantId": "id", "name": "Name", "speakingTimeSeconds": 120, "speakingPercentage": 30, "wordCount": 450, "dominantEmotion": "confident", "emotionBreakdown": [{"emotion": "confident", "percentage": 40}], "emotionTimeline": [{"time": 0, "emotion": "neutral", "confidence": 0.8}], "engagementLevel": "high|medium|low", "engagementIndicators": ["Asked 3 questions"], "expressionsSummary": "Summary", "dominantExpression": "engaged", "expressionTimeline": [], "keyContributions": ["Proposed new timeline"], "questionsAsked": 3, "decisionsInfluenced": 1, "behaviorNotes": "Notes", "communicationStyle": "Direct"}],
  "suggestedFollowUps": [{"id": "fu-0", "type": "email|meeting|task|message|document", "description": "What to follow up on", "suggestedRecipients": ["Name1"], "priority": "high|medium|low", "suggestedDeadline": "2024-01-20"}]
}

IMPORTANT: Return ONLY valid JSON. Analyze every transcript segment. Be specific about emotions and intent.`;

    try {
      const { generateJson } = await import('../server/ai-service');
      const result = await generateJson(prompt, {
        maxTokens: 8192,
        systemPrompt: 'You are an expert meeting analyst specializing in emotional intelligence, behavioral analysis, and meeting outcomes. Always return valid JSON matching the requested schema.',
      });

      if (result.success && result.data) {
        return this.validateAndCleanResult(result.data, input);
      }
      throw new Error(result.error || 'AI analysis returned no data');
    } catch (err: any) {
      console.error('LLM Meeting Analysis failed:', err.message);
      return this.createFallbackResult(input);
    }
  }

  async analyzeSegmentBatch(
    segments: { speakerName: string; text: string; startTime: number; endTime: number }[],
    context: string
  ): Promise<ReviewTranscriptSegment[]> {
    const segmentTexts = segments.map((seg, i) =>
      `[${i}] ${seg.speakerName}: "${seg.text}"`
    ).join('\n');

    const prompt = `Analyze these meeting transcript segments for emotion and intent.

Context: ${context}

Segments:
${segmentTexts}

Return JSON array:
[{
  "index": 0,
  "primaryEmotion": "neutral|happy|excited|frustrated|confused|skeptical|serious|confident|hesitant|defensive",
  "emotionConfidence": 0.8,
  "intent": "statement|question|request|promise|concern|objection|agreement|disagreement|suggestion|decision",
  "flags": [{"type": "sarcasm|hesitation|frustration", "confidence": 0.7}],
  "interpretation": "What they really meant",
  "isKeyMoment": false,
  "keyMomentReason": null
}]`;

    try {
      const { generateJson } = await import('../server/ai-service');
      const result = await generateJson(prompt, {
        maxTokens: 2048,
      });

      if (result.success && result.data) {
        const analyses = Array.isArray(result.data) ? result.data : result.data.segments || [];
        return segments.map((seg, i) => {
          const analysis = analyses.find((a: any) => a.index === i) || analyses[i] || {};
          return {
            id: `seg-${i}`,
            speakerId: seg.speakerName.toLowerCase().replace(/\s+/g, '-'),
            speakerName: seg.speakerName,
            text: seg.text,
            startTime: seg.startTime,
            endTime: seg.endTime,
            primaryEmotion: analysis.primaryEmotion || 'neutral',
            emotionConfidence: analysis.emotionConfidence || 0.5,
            flags: analysis.flags || [],
            intent: analysis.intent || 'statement',
            interpretation: analysis.interpretation,
            isKeyMoment: analysis.isKeyMoment || false,
            keyMomentReason: analysis.keyMomentReason,
          };
        });
      }
    } catch (err: any) {
      console.error('Segment batch analysis failed:', err.message);
    }

    // Fallback: return segments with neutral analysis
    return segments.map((seg, i) => ({
      id: `seg-${i}`,
      speakerId: seg.speakerName.toLowerCase().replace(/\s+/g, '-'),
      speakerName: seg.speakerName,
      text: seg.text,
      startTime: seg.startTime,
      endTime: seg.endTime,
      primaryEmotion: 'neutral',
      emotionConfidence: 0.5,
      flags: [],
      intent: 'statement' as IntentType,
      isKeyMoment: false,
    }));
  }

  private validateAndCleanResult(data: any, _input: AnalysisInput): FullAnalysisResult {
    return {
      analyzedSegments: (data.analyzedSegments || []).map((seg: any, i: number) => ({
        id: seg.id || `seg-${i}`,
        speakerId: seg.speakerId || seg.speakerName?.toLowerCase().replace(/\s+/g, '-') || `speaker-${i}`,
        speakerName: seg.speakerName || 'Unknown',
        text: seg.text || '',
        startTime: seg.startTime || 0,
        endTime: seg.endTime || 0,
        primaryEmotion: seg.primaryEmotion || 'neutral',
        emotionConfidence: seg.emotionConfidence || 0.5,
        flags: seg.flags || [],
        intent: seg.intent || 'statement',
        interpretation: seg.interpretation,
        isKeyMoment: seg.isKeyMoment || false,
        keyMomentReason: seg.keyMomentReason,
      })),
      keyMoments: data.keyMoments || [],
      actionItems: (data.actionItems || []).map((item: any) => ({
        ...item,
        status: item.status || 'pending',
        priority: item.priority || 'medium',
        confidence: item.confidence || 0.7,
      })),
      promises: data.promises || [],
      openQuestions: data.openQuestions || [],
      topics: data.topics || [],
      participantAnalyses: (data.participantAnalyses || []).map((pa: any) => ({
        ...pa,
        expressionTimeline: pa.expressionTimeline || [],
        emotionTimeline: pa.emotionTimeline || [],
        emotionBreakdown: pa.emotionBreakdown || [],
        engagementIndicators: pa.engagementIndicators || [],
        keyContributions: pa.keyContributions || [],
      })),
      summary: data.summary || 'Meeting analysis pending.',
      executiveSummary: data.executiveSummary || 'Meeting analyzed.',
      emotionalOverview: data.emotionalOverview || 'Emotional dynamics not analyzed.',
      overallSentiment: data.overallSentiment || 'neutral',
      sentimentTrajectory: data.sentimentTrajectory || 'stable',
      suggestedFollowUps: data.suggestedFollowUps || [],
    };
  }

  private createFallbackResult(input: AnalysisInput): FullAnalysisResult {
    const speakerWordCounts: Record<string, number> = {};
    let totalWords = 0;

    for (const seg of input.transcriptSegments) {
      const words = seg.text.split(/\s+/).length;
      speakerWordCounts[seg.speakerName] = (speakerWordCounts[seg.speakerName] || 0) + words;
      totalWords += words;
    }

    return {
      analyzedSegments: input.transcriptSegments.map((seg, i) => ({
        id: `seg-${i}`,
        speakerId: seg.speakerName.toLowerCase().replace(/\s+/g, '-'),
        speakerName: seg.speakerName,
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
        primaryEmotion: 'neutral',
        emotionConfidence: 0.3,
        flags: [],
        intent: 'statement' as IntentType,
        isKeyMoment: false,
      })),
      keyMoments: [],
      actionItems: [],
      promises: [],
      openQuestions: [],
      topics: [],
      participantAnalyses: input.participants.map(p => ({
        participantId: p.id,
        name: p.name,
        speakingTimeSeconds: 0,
        speakingPercentage: totalWords > 0 ? Math.round(((speakerWordCounts[p.name] || 0) / totalWords) * 100) : 0,
        wordCount: speakerWordCounts[p.name] || 0,
        dominantEmotion: 'neutral',
        emotionBreakdown: [{ emotion: 'neutral', percentage: 100 }],
        emotionTimeline: [],
        engagementLevel: 'medium' as const,
        engagementIndicators: [],
        expressionsSummary: 'Expression data not available',
        dominantExpression: 'neutral',
        expressionTimeline: [],
        keyContributions: [],
        questionsAsked: 0,
        decisionsInfluenced: 0,
        behaviorNotes: 'Analysis not available - AI processing failed',
        communicationStyle: 'Unknown',
      })),
      summary: `Meeting "${input.meetingTitle}" with ${input.participants.length} participants lasting ${Math.round(input.duration / 60)} minutes. Full AI analysis was not available.`,
      executiveSummary: `Meeting: ${input.meetingTitle}`,
      emotionalOverview: 'Emotional analysis not available.',
      overallSentiment: 'neutral',
      sentimentTrajectory: 'stable',
      suggestedFollowUps: [],
    };
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
