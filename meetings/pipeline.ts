/**
 * Meeting Pipeline Orchestrator
 *
 * End-to-end pipeline that ties all meeting services together:
 *
 * 1. User provides meeting URL -> Recall.ai bot joins the call
 * 2. User selects meeting window -> local window capture starts
 * 3. During meeting:
 *    - Recall.ai captures audio
 *    - Window capture captures video frames
 *    - Face detection runs on frames (if available)
 *    - Visual observations are collected
 * 4. When meeting ends:
 *    a. Download audio from Recall.ai
 *    b. Run Whisper transcription on full audio
 *    c. Run speaker diarization (merge audio + visual)
 *    d. Send to LLM meeting analyzer
 *    e. Generate MeetingReview
 *    f. Notify user that review is ready
 */

import type {
  MeetingReview,
  VisualObservation,
  RawTranscriptSegment,
  AnalysisInput,
  PipelineStatus,
  PipelineState,
  PipelineConfig,
  PipelineEventType,
  PipelineEvent,
  FaceDetectionService,
  DetectedParticipant,
  FrameInput,
  FrameAnalysisResult,
} from './types.js';
import { RecallBotServiceImpl } from './recall-bot.js';
import { SpeakerDiarizationServiceImpl } from './diarization.js';
import { TranscriptionServiceImpl } from './transcription.js';
import { ReviewServiceImpl } from './review.js';

// ============================================
// STUB FACE DETECTION (real impl added later)
// ============================================

class NoOpFaceDetection implements FaceDetectionService {
  private participants: DetectedParticipant[] = [];

  reset(): void { this.participants = []; }
  isReady(): boolean { return false; }
  async analyzeFrame(_input: FrameInput): Promise<FrameAnalysisResult> {
    return { frameTimestamp: 0, faces: [], participants: [] };
  }
  getParticipants(): DetectedParticipant[] { return this.participants; }
  getParticipant(_id: string): DetectedParticipant | undefined { return undefined; }
}

// ============================================
// PIPELINE IMPLEMENTATION
// ============================================

export class MeetingPipelineServiceImpl {
  private state: PipelineState = {
    status: 'idle',
    meetingTitle: '',
    platform: '',
    captureActive: false,
    participantCount: 0,
    segmentCount: 0,
    duration: 0,
  };

  private recallBot = new RecallBotServiceImpl();
  private faceDetection: FaceDetectionService = new NoOpFaceDetection();
  private diarization = new SpeakerDiarizationServiceImpl();
  private transcription = new TranscriptionServiceImpl();
  private reviewService = new ReviewServiceImpl();

  private listeners = new Map<PipelineEventType, Set<(event: PipelineEvent) => void>>();
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private captureCleanup: (() => void) | null = null;
  private config: PipelineConfig | null = null;
  private audioFilePath: string | null = null;

  async init(): Promise<void> {
    await this.transcription.init();
    console.log('MeetingPipelineService initialized');
  }

  async destroy(): Promise<void> {
    if (this.isActive()) {
      await this.stop();
    }
    await this.recallBot.destroy();
    console.log('MeetingPipelineService stopped');
  }

  /**
   * Optionally inject a real face detection implementation.
   */
  setFaceDetection(impl: FaceDetectionService): void {
    this.faceDetection = impl;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  async start(config: PipelineConfig): Promise<void> {
    if (this.isActive()) {
      throw new Error('A pipeline is already active. Stop it first.');
    }

    this.config = config;
    this.state = {
      status: 'bot_joining',
      meetingTitle: config.meetingTitle,
      meetingUrl: config.meetingUrl,
      platform: config.platform,
      captureActive: false,
      participantCount: 0,
      segmentCount: 0,
      duration: 0,
      startedAt: Date.now(),
    };
    this.emit('status_changed', this.state);

    this.faceDetection.reset();
    this.diarization.reset();

    try {
      await this.deployBot(config);
      this.startDurationTimer();

      if (config.captureSourceId) {
        await this.startCapture(config.captureSourceId);
      }

      this.state.status = 'capturing';
      this.emit('status_changed', this.state);
    } catch (err: any) {
      this.state.status = 'error';
      this.state.error = err.message;
      this.emit('error', { message: err.message });
      this.emit('status_changed', this.state);
      throw err;
    }
  }

  async stop(): Promise<MeetingReview | null> {
    if (!this.isActive()) return null;

    try {
      await this.stopCapture();
      this.stopDurationTimer();

      this.state.status = 'bot_processing';
      this.emit('status_changed', this.state);

      let transcriptSegments: RawTranscriptSegment[] = [];

      if (this.state.botId) {
        try {
          await this.recallBot.stopBot(this.state.botId);
          await this.waitForBotProcessing(this.state.botId);

          const recording = await this.recallBot.getRecording(this.state.botId);
          if (recording?.audioUrl) {
            this.audioFilePath = recording.audioUrl;
          }

          const recallTranscript = await this.recallBot.getTranscript(this.state.botId);
          if (recallTranscript?.segments) {
            transcriptSegments = recallTranscript.segments.map((seg) => ({
              text: seg.text,
              startTime: seg.startTime,
              endTime: seg.endTime,
              speakerLabel: `Speaker ${seg.speakerId}`,
              confidence: seg.confidence,
            }));
          }
        } catch (err: any) {
          console.warn('Bot processing failed, will try local transcription:', err.message);
        }
      }

      // Run local Whisper transcription if available
      this.state.status = 'transcribing';
      this.emit('status_changed', this.state);

      if (this.audioFilePath) {
        try {
          const whisperResult = await this.transcription.transcribeFile(this.audioFilePath);
          if (whisperResult.segments && whisperResult.segments.length > 0) {
            transcriptSegments = whisperResult.segments.map((seg) => ({
              text: seg.text,
              startTime: seg.startTime,
              endTime: seg.endTime,
              speakerLabel: seg.speakerName || undefined,
              confidence: seg.confidence,
            }));
          }
        } catch (err: any) {
          console.warn('Local transcription failed:', err.message);
        }
      }

      if (transcriptSegments.length === 0) {
        console.warn('No transcript data available');
      }

      // Run speaker diarization
      this.state.status = 'analyzing';
      this.emit('status_changed', this.state);

      const visualObservations = this.diarization.getVisualObservations();
      const diarizationResult = await this.diarization.diarize(
        transcriptSegments,
        visualObservations,
        this.config?.participantNames
      );

      const participants = diarizationResult.participants.map((p) => ({
        id: p.id,
        name: p.name,
        role: undefined,
      }));

      // Get expression data from face detection
      const faceParticipants = this.faceDetection.getParticipants();
      const expressionData: AnalysisInput['expressionData'] = [];
      for (const fp of faceParticipants) {
        for (const entry of fp.expressionHistory) {
          expressionData.push({
            participantName: fp.name || fp.id,
            timestamp: entry.timestamp,
            expression: entry.expression,
            confidence: entry.confidence,
          });
        }
      }

      const analysisInput: AnalysisInput = {
        meetingTitle: this.state.meetingTitle,
        meetingDate: this.state.startedAt
          ? new Date(this.state.startedAt).toISOString()
          : new Date().toISOString(),
        duration: this.state.duration,
        platform: this.state.platform,
        participants,
        transcriptSegments: diarizationResult.segments.map((seg) => ({
          speakerName: seg.speakerName,
          text: seg.text,
          startTime: seg.startTime,
          endTime: seg.endTime,
        })),
        expressionData,
      };

      // Generate review
      this.state.status = 'generating_review';
      this.emit('status_changed', this.state);

      const review = await this.reviewService.generateReview(analysisInput);

      // Store meeting review in Moltbook (company brain)
      await this.storeMeetingInMoltbook(review, analysisInput);

      this.state.status = 'complete';
      this.state.reviewId = review.id;
      this.emit('status_changed', this.state);
      this.emit('review_ready', { reviewId: review.id, review });

      this.resetState();
      return review;
    } catch (err: any) {
      this.state.status = 'error';
      this.state.error = err.message;
      this.emit('error', { message: err.message });
      this.emit('status_changed', this.state);
      this.resetState();
      return null;
    }
  }

  getState(): PipelineState {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.status !== 'idle' && this.state.status !== 'complete' && this.state.status !== 'error';
  }

  async startCapture(sourceId: string): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).electron) {
      console.warn('Electron not available for capture');
      return;
    }

    try {
      await (window as any).electron.startCapture(sourceId, {
        fps: 10,
        quality: 'medium',
        includeAudio: false,
      });

      const cleanup = (window as any).electron.onCaptureFrame((frameData: any) => {
        this.processFrame(frameData);
      });
      this.captureCleanup = cleanup;

      this.state.captureActive = true;
      this.emit('status_changed', this.state);
    } catch (err: any) {
      console.error('Failed to start capture:', err.message);
    }
  }

  async stopCapture(): Promise<void> {
    if (this.captureCleanup) {
      this.captureCleanup();
      this.captureCleanup = null;
    }

    if (typeof window !== 'undefined' && (window as any).electron?.stopCapture) {
      try {
        await (window as any).electron.stopCapture();
      } catch (err: any) {
        console.warn('Stop capture error:', err.message);
      }
    }

    this.state.captureActive = false;
  }

  on(type: PipelineEventType, handler: (event: PipelineEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: PipelineEventType, handler: (event: PipelineEvent) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  // ============================================
  // PRIVATE: Moltbook Integration
  // ============================================

  /**
   * Store processed meeting data in Moltbook so it becomes part of
   * the company brain — queryable by Ask AI across all team members.
   */
  private async storeMeetingInMoltbook(review: MeetingReview, input: AnalysisInput): Promise<void> {
    const hubUrl = process.env.HUB_URL || 'http://localhost:3100';
    const companyId = process.env.COMPANY_ID || 'default';

    try {
      // Build knowledge entries from the review
      const knowledgeEntries: Array<{
        situation: string;
        keywords: string[];
        actionType: string;
        solution: string;
      }> = [];

      // 1. Meeting summary
      if (review.summary) {
        knowledgeEntries.push({
          situation: `Meeting: ${input.meetingTitle} on ${input.meetingDate}`,
          keywords: ['meeting', 'summary', input.meetingTitle, ...input.participants.map(p => p.name)],
          actionType: 'meeting_summary',
          solution: review.summary,
        });
      }

      // 2. Action items
      if (review.actionItems && review.actionItems.length > 0) {
        for (const item of review.actionItems) {
          knowledgeEntries.push({
            situation: `Action item from ${input.meetingTitle}: ${item.description}`,
            keywords: ['action', 'todo', input.meetingTitle, item.assignee || ''],
            actionType: 'action_item',
            solution: `${item.description}${item.assignee ? ` (assigned to ${item.assignee})` : ''}`,
          });
        }
      }

      // 3. Key topics
      if (review.topics && review.topics.length > 0) {
        for (const topic of review.topics) {
          knowledgeEntries.push({
            situation: `Topic from ${input.meetingTitle}: ${topic.topic}`,
            keywords: ['topic', input.meetingTitle, topic.topic],
            actionType: 'topic',
            solution: topic.summary,
          });
        }
      }

      // Upload each entry to Moltbook Hub via REST
      for (const entry of knowledgeEntries) {
        await fetch(`${hubUrl}/api/knowledge/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            userId: 'system',
            ...entry,
          }),
        });
      }

      console.log(`Stored ${knowledgeEntries.length} knowledge entries from meeting in Moltbook`);
    } catch (err: any) {
      console.warn('Failed to store meeting in Moltbook:', err.message);
    }
  }

  // ============================================
  // PRIVATE: Bot Management
  // ============================================

  private async deployBot(config: PipelineConfig): Promise<void> {
    try {
      if (config.recallApiKey) {
        this.recallBot.configure(config.recallApiKey);
      }

      const bot = await this.recallBot.createBot({
        meetingUrl: config.meetingUrl,
        botName: 'Zinc Cat',
        recording: { autoStart: true },
        transcription: { provider: 'default' },
      });

      this.state.botId = bot.id;
    } catch (err: any) {
      throw new Error(`Failed to deploy bot: ${err.message}`);
    }
  }

  private async waitForBotProcessing(botId: string, maxWaitMs = 120000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await this.recallBot.getBotStatus(botId);
        if (status?.status === 'done' || status?.status === 'error') {
          return;
        }
      } catch {
        // Ignore transient errors
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    console.warn('Bot processing timed out');
  }

  // ============================================
  // PRIVATE: Frame Processing
  // ============================================

  private async processFrame(frameData: any): Promise<void> {
    if (!this.faceDetection.isReady()) return;

    try {
      const result = await this.faceDetection.analyzeFrame({
        data: frameData.data || frameData,
        width: frameData.width || 1920,
        height: frameData.height || 1080,
        timestamp: frameData.timestamp || (Date.now() - (this.state.startedAt || Date.now())) / 1000,
        format: 'jpeg',
      });

      const participants = this.faceDetection.getParticipants();
      this.state.participantCount = participants.length;

      for (const match of result.participants) {
        const participant = this.faceDetection.getParticipant(match.participantId);
        if (participant) {
          const observation: VisualObservation = {
            timestamp: result.frameTimestamp,
            participantId: participant.id,
            participantName: participant.name,
            isSpeaking: participant.isSpeaking,
            speakingConfidence: participant.speakingConfidence,
            expression: participant.currentEmotion,
            expressionConfidence: match.confidence,
          };
          this.diarization.addVisualObservation(observation);

          this.emit('expression_update', {
            participantId: participant.id,
            participantName: participant.name,
            expression: participant.currentEmotion,
            isSpeaking: participant.isSpeaking,
          });
        }
      }

      if (result.faces.length > 0) {
        this.emit('participant_detected', {
          count: result.faces.length,
          participants: participants.map((p) => ({
            id: p.id,
            name: p.name,
            expression: p.currentEmotion,
            isSpeaking: p.isSpeaking,
          })),
        });
      }
    } catch {
      // Don't spam errors for frame processing
    }
  }

  // ============================================
  // PRIVATE: Timers & Helpers
  // ============================================

  private startDurationTimer(): void {
    this.durationTimer = setInterval(() => {
      if (this.state.startedAt) {
        this.state.duration = Math.floor((Date.now() - this.state.startedAt) / 1000);
      }
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private emit(type: PipelineEventType, data: any): void {
    const event: PipelineEvent = { type, data, timestamp: Date.now() };
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('Pipeline event handler error:', err);
        }
      }
    }
  }

  private resetState(): void {
    this.config = null;
    this.audioFilePath = null;
  }
}
