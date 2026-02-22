/**
 * Meeting Module Types
 *
 * Merged from: recall-types.ts, review-types.ts,
 * plus Expression (face-detection) and IntentType (meeting-intelligence).
 */

// ============================================
// EXPRESSION (from face detection)
// ============================================

export type Expression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'disgusted'
  | 'surprised'
  | 'smiling'
  | 'frowning'
  | 'confused'
  | 'skeptical'
  | 'thinking'
  | 'interested'
  | 'bored'
  | 'eye_roll';

// ============================================
// INTENT (from meeting-intelligence)
// ============================================

export type IntentType =
  | 'statement'
  | 'question'
  | 'request'
  | 'promise'
  | 'concern'
  | 'objection'
  | 'agreement'
  | 'disagreement'
  | 'suggestion'
  | 'decision'
  | 'escalation'
  | 'deescalation'
  | 'humor'
  | 'sarcasm'
  | 'redirect'
  | 'clarification';

// ============================================
// RECALL.AI BOT TYPES
// ============================================

export type RecallPlatform = 'zoom' | 'teams' | 'google_meet' | 'webex' | 'other';

export type RecallBotStatus =
  | 'ready'
  | 'joining'
  | 'in_waiting_room'
  | 'in_call'
  | 'recording'
  | 'processing'
  | 'done'
  | 'error'
  | 'fatal';

export interface RecallBotConfig {
  meetingUrl: string;
  botName?: string;
  joinAt?: string;
  automaticLeave?: {
    waitingRoomTimeout?: number;
    noOneJoinedTimeout?: number;
    everyoneLeftTimeout?: number;
  };
  recording?: {
    autoStart?: boolean;
  };
  transcription?: {
    provider?: 'default' | 'assembly_ai' | 'deepgram';
  };
}

export interface RecallBot {
  id: string;
  meetingUrl: string;
  status: RecallBotStatus;
  statusChanges: {
    code: RecallBotStatus;
    message?: string;
    createdAt: string;
  }[];
  meetingParticipants?: RecallParticipant[];
  meetingMetadata?: {
    title?: string;
    startTime?: string;
    endTime?: string;
  };
  recording?: RecallRecording;
  transcript?: RecallTranscript;
  createdAt: string;
  updatedAt: string;
}

export interface RecallParticipant {
  id: number;
  name: string;
  isHost?: boolean;
  events?: {
    code: 'join' | 'leave' | 'screen_share_start' | 'screen_share_stop';
    createdAt: string;
  }[];
}

export interface RecallRecording {
  id: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  fileSize?: number;
  status: 'processing' | 'ready' | 'error';
}

export interface RecallTranscript {
  id: string;
  segments: RecallTranscriptSegment[];
  status: 'processing' | 'ready' | 'error';
}

export interface RecallTranscriptSegment {
  speakerId: number;
  speakerName: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  language?: string;
}

export type RecallWebhookEvent =
  | 'bot.status_change'
  | 'bot.transcription'
  | 'bot.recording_ready'
  | 'bot.participant_join'
  | 'bot.participant_leave';

export interface RecallWebhookPayload {
  event: RecallWebhookEvent;
  data: {
    botId: string;
    status?: RecallBotStatus;
    message?: string;
    participant?: RecallParticipant;
    transcript?: RecallTranscriptSegment;
    recording?: RecallRecording;
  };
}

export interface BotSession {
  id: string;
  recallBotId: string;
  meetingUrl: string;
  platform: RecallPlatform;
  meetingTitle?: string;
  status: RecallBotStatus;
  participants?: RecallParticipant[];
  audioFilePath?: string;
  transcriptSegments?: RecallTranscriptSegment[];
  startedAt: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RecallBotService {
  createBot(config: RecallBotConfig): Promise<RecallBot>;
  getBotStatus(botId: string): Promise<RecallBot>;
  stopBot(botId: string): Promise<void>;
  getRecording(botId: string): Promise<RecallRecording | null>;
  getTranscript(botId: string): Promise<RecallTranscript | null>;
  downloadAudio(mediaUrl: string, savePath: string): Promise<string>;
  listActiveBots(): Promise<RecallBot[]>;
  handleWebhook(payload: RecallWebhookPayload): Promise<void>;
}

// ============================================
// TRANSCRIPTION TYPES
// ============================================

export interface TranscriptSegment {
  id: string;
  speakerName: string;
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  language?: string;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  duration: number;
}

export interface TranscriptionConfig {
  language?: string;
  modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  translateToEnglish?: boolean;
}

// ============================================
// DIARIZATION TYPES
// ============================================

export interface RawTranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
  speakerLabel?: string;
  confidence?: number;
}

export interface VisualObservation {
  timestamp: number;
  participantId: string;
  participantName?: string;
  isSpeaking: boolean;
  speakingConfidence: number;
  expression: Expression;
  expressionConfidence: number;
  headPose?: { pitch: number; yaw: number; roll: number };
}

export interface DiarizedSegment {
  text: string;
  startTime: number;
  endTime: number;
  speakerId: string;
  speakerName: string;
  confidence: number;
  dominantExpression: Expression;
  expressionConfidence: number;
  expressions: { expression: Expression; percentage: number }[];
  isSpeaking: boolean;
  engagement: 'high' | 'medium' | 'low';
  audioSource: 'whisper' | 'recall';
  visualMatch: boolean;
}

export interface DiarizationResult {
  segments: DiarizedSegment[];
  participants: DiarizedParticipant[];
  duration: number;
  quality: 'high' | 'medium' | 'low';
}

export interface DiarizedParticipant {
  id: string;
  name: string;
  totalSpeakingTime: number;
  speakingPercentage: number;
  segmentCount: number;
  dominantExpression: Expression;
  expressionTimeline: { time: number; expression: Expression }[];
  engagementLevel: 'high' | 'medium' | 'low';
  wordCount: number;
}

// ============================================
// ANALYZER INPUT/OUTPUT
// ============================================

export interface AnalysisInput {
  meetingTitle: string;
  meetingDate: string;
  duration: number;
  platform: string;
  participants: { id: string; name: string; role?: string }[];
  transcriptSegments: {
    speakerName: string;
    text: string;
    startTime: number;
    endTime: number;
  }[];
  expressionData?: {
    participantName: string;
    timestamp: number;
    expression: string;
    confidence: number;
  }[];
}

export interface FullAnalysisResult {
  analyzedSegments: ReviewTranscriptSegment[];
  keyMoments: ReviewKeyMoment[];
  actionItems: ReviewActionItem[];
  promises: ReviewPromise[];
  openQuestions: ReviewOpenQuestion[];
  topics: ReviewTopic[];
  participantAnalyses: ReviewParticipantAnalysis[];
  summary: string;
  executiveSummary: string;
  emotionalOverview: string;
  overallSentiment: string;
  sentimentTrajectory: 'improving' | 'stable' | 'declining';
  suggestedFollowUps: ReviewFollowUp[];
}

// ============================================
// MEETING REVIEW ENTITY
// ============================================

export interface MeetingReview {
  id: string;
  meetingRecordingId?: string;
  botSessionId?: string;
  calendarEventId?: string;
  title: string;
  date: number;
  duration: number;
  platform: string;
  participants: ReviewParticipant[];
  transcriptSegments: ReviewTranscriptSegment[];
  summary: string;
  executiveSummary: string;
  emotionalOverview: string;
  keyMoments: ReviewKeyMoment[];
  actionItems: ReviewActionItem[];
  promises: ReviewPromise[];
  openQuestions: ReviewOpenQuestion[];
  topics: ReviewTopic[];
  participantAnalyses: ReviewParticipantAnalysis[];
  overallSentiment: string;
  sentimentTrajectory: 'improving' | 'stable' | 'declining';
  suggestedFollowUps: ReviewFollowUp[];
  searchableContent: string;
  status: 'generating' | 'ready' | 'error';
  errorMessage?: string;
  generatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewParticipant {
  id: string;
  name: string;
  email?: string;
  role?: string;
  isInternal: boolean;
  avatarUrl?: string;
}

export interface ReviewParticipantAnalysis {
  participantId: string;
  name: string;
  speakingTimeSeconds: number;
  speakingPercentage: number;
  wordCount: number;
  dominantEmotion: string;
  emotionBreakdown: { emotion: string; percentage: number }[];
  emotionTimeline: { time: number; emotion: string; confidence: number }[];
  engagementLevel: 'high' | 'medium' | 'low';
  engagementIndicators: string[];
  expressionsSummary: string;
  dominantExpression: string;
  expressionTimeline: { time: number; expression: string }[];
  keyContributions: string[];
  questionsAsked: number;
  decisionsInfluenced: number;
  behaviorNotes: string;
  communicationStyle: string;
}

export interface ReviewTranscriptSegment {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  startTime: number;
  endTime: number;
  primaryEmotion: string;
  emotionConfidence: number;
  flags: ReviewEmotionFlag[];
  intent: IntentType | string;
  interpretation?: string;
  isKeyMoment: boolean;
  keyMomentReason?: string;
}

export interface ReviewEmotionFlag {
  type: string;
  confidence: number;
  description?: string;
}

export interface ReviewKeyMoment {
  id: string;
  timestamp: number;
  type: 'decision' | 'commitment' | 'concern' | 'breakthrough' | 'tension' | 'agreement' | 'disagreement';
  title: string;
  description: string;
  speakers: string[];
  impact: 'high' | 'medium' | 'low';
}

export interface ReviewActionItem {
  id: string;
  description: string;
  assignee?: string;
  assigneeId?: string;
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  sourceTimestamp?: number;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ReviewPromise {
  id: string;
  speaker: string;
  speakerId?: string;
  promise: string;
  toWhom?: string;
  deadline?: string;
  confidence: number;
  sourceTimestamp?: number;
}

export interface ReviewOpenQuestion {
  id: string;
  question: string;
  askedBy: string;
  askedById?: string;
  timestamp: number;
  addressed: boolean;
}

export interface ReviewTopic {
  id: string;
  topic: string;
  timeSpentSeconds: number;
  timeSpentPercentage: number;
  sentiment: string;
  participants: string[];
  summary: string;
}

export interface ReviewFollowUp {
  id: string;
  type: 'email' | 'meeting' | 'task' | 'message' | 'document';
  description: string;
  suggestedRecipients?: string[];
  priority: 'high' | 'medium' | 'low';
  suggestedDeadline?: string;
}

// ============================================
// AI Q&A TYPES
// ============================================

export interface ReviewConversation {
  id: string;
  reviewId: string;
  userId: string;
  messages: ReviewChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ReviewChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  references?: ReviewReference[];
}

export interface ReviewReference {
  type: 'transcript' | 'key_moment' | 'action_item' | 'participant_analysis';
  id: string;
  preview: string;
  timestamp?: number;
}

export interface QAResponse {
  answer: string;
  references: ReviewReference[];
  conversationId: string;
  suggestedFollowUps: string[];
}

// ============================================
// FACE DETECTION (minimal interface for pipeline)
// ============================================

export interface DetectedParticipant {
  id: string;
  name?: string;
  isSpeaking: boolean;
  speakingConfidence: number;
  currentEmotion: Expression;
  expressionHistory: { timestamp: number; expression: string; confidence: number }[];
}

export interface FrameInput {
  data: any;
  width: number;
  height: number;
  timestamp: number;
  format: string;
}

export interface FrameAnalysisResult {
  frameTimestamp: number;
  faces: any[];
  participants: { participantId: string; confidence: number }[];
}

export interface FaceDetectionService {
  reset(): void;
  isReady(): boolean;
  analyzeFrame(input: FrameInput): Promise<FrameAnalysisResult>;
  getParticipants(): DetectedParticipant[];
  getParticipant(id: string): DetectedParticipant | undefined;
}

// ============================================
// PIPELINE TYPES
// ============================================

export type PipelineStatus =
  | 'idle'
  | 'bot_joining'
  | 'capturing'
  | 'bot_processing'
  | 'transcribing'
  | 'analyzing'
  | 'generating_review'
  | 'complete'
  | 'error';

export interface PipelineState {
  status: PipelineStatus;
  meetingTitle: string;
  meetingUrl?: string;
  platform: string;
  botId?: string;
  botSessionId?: string;
  captureActive: boolean;
  participantCount: number;
  segmentCount: number;
  duration: number;
  error?: string;
  reviewId?: string;
  startedAt?: number;
}

export interface PipelineConfig {
  meetingUrl: string;
  meetingTitle: string;
  platform: 'teams' | 'zoom' | 'meet' | 'other';
  captureSourceId?: string;
  participantNames?: string[];
  recallApiKey?: string;
}

export type PipelineEventType =
  | 'status_changed'
  | 'participant_detected'
  | 'transcript_segment'
  | 'expression_update'
  | 'review_ready'
  | 'error';

export interface PipelineEvent {
  type: PipelineEventType;
  data: any;
  timestamp: number;
}
