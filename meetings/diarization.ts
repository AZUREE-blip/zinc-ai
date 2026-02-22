/**
 * Speaker Diarization Service
 *
 * Merges audio transcript data (from Whisper/Recall.ai) with
 * visual data (from face detection) to produce a clean,
 * speaker-labeled transcript with expression annotations.
 *
 * Audio tells us WHAT was said and WHEN.
 * Video tells us WHO was talking (mouth movement) and HOW they looked.
 * This service combines both into a unified timeline.
 */

import type {
  Expression,
  RawTranscriptSegment,
  VisualObservation,
  DiarizedSegment,
  DiarizationResult,
  DiarizedParticipant,
} from './types.js';

export class SpeakerDiarizationServiceImpl {
  private observations: VisualObservation[] = [];

  addVisualObservation(observation: VisualObservation): void {
    this.observations.push(observation);
  }

  getVisualObservations(): VisualObservation[] {
    return [...this.observations];
  }

  reset(): void {
    this.observations = [];
  }

  async diarize(
    transcriptSegments: RawTranscriptSegment[],
    visualObservations: VisualObservation[],
    participantNames: string[] = []
  ): Promise<DiarizationResult> {
    const allVisual = [...this.observations, ...visualObservations];

    const sortedTranscript = [...transcriptSegments].sort((a, b) => a.startTime - b.startTime);
    const sortedVisual = [...allVisual].sort((a, b) => a.timestamp - b.timestamp);

    const speakerNameMap = this.buildSpeakerNameMap(sortedVisual, participantNames);
    const speakerLabelMap = this.mapSpeakerLabelsToParticipants(sortedTranscript, sortedVisual);

    const segments: DiarizedSegment[] = [];

    for (const seg of sortedTranscript) {
      const overlapping = sortedVisual.filter(
        (v) => v.timestamp >= seg.startTime && v.timestamp <= seg.endTime
      );

      let speakerId = 'unknown';
      let speakerName = seg.speakerLabel || 'Unknown';
      let visualMatch = false;

      // First try: visual data to find who was speaking
      const speakingObs = overlapping.filter((v) => v.isSpeaking && v.speakingConfidence > 0.3);
      if (speakingObs.length > 0) {
        const speakerCounts = new Map<string, number>();
        for (const obs of speakingObs) {
          const count = speakerCounts.get(obs.participantId) || 0;
          speakerCounts.set(obs.participantId, count + obs.speakingConfidence);
        }

        let maxScore = 0;
        for (const [pid, score] of speakerCounts) {
          if (score > maxScore) {
            maxScore = score;
            speakerId = pid;
          }
        }
        speakerName = speakerNameMap.get(speakerId) || speakerName;
        visualMatch = true;
      }

      // Second try: speaker label mapping
      if (!visualMatch && seg.speakerLabel && speakerLabelMap.has(seg.speakerLabel)) {
        const mapped = speakerLabelMap.get(seg.speakerLabel)!;
        speakerId = mapped.participantId;
        speakerName = mapped.name;
      }

      const expressionAnalysis = this.analyzeExpressionsDuringSegment(overlapping);
      const engagement = this.assessEngagement(overlapping);

      segments.push({
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
        speakerId,
        speakerName,
        confidence: visualMatch ? 0.9 : (seg.confidence || 0.5),
        dominantExpression: expressionAnalysis.dominant,
        expressionConfidence: expressionAnalysis.confidence,
        expressions: expressionAnalysis.distribution,
        isSpeaking: true,
        engagement,
        audioSource: 'whisper',
        visualMatch,
      });
    }

    const participants = this.buildParticipantSummaries(segments, sortedVisual, speakerNameMap);

    const duration = sortedTranscript.length > 0
      ? sortedTranscript[sortedTranscript.length - 1].endTime - sortedTranscript[0].startTime
      : 0;

    const matchRate = segments.filter((s) => s.visualMatch).length / Math.max(segments.length, 1);
    const quality = matchRate > 0.7 ? 'high' : matchRate > 0.3 ? 'medium' : 'low';

    return { segments, participants, duration, quality };
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private buildSpeakerNameMap(
    observations: VisualObservation[],
    participantNames: string[]
  ): Map<string, string> {
    const nameMap = new Map<string, string>();

    for (const obs of observations) {
      if (obs.participantName && !nameMap.has(obs.participantId)) {
        nameMap.set(obs.participantId, obs.participantName);
      }
    }

    const uniqueParticipants = new Set<string>();
    for (const obs of observations) {
      uniqueParticipants.add(obs.participantId);
    }

    let nameIndex = 0;
    for (const pid of uniqueParticipants) {
      if (!nameMap.has(pid) && nameIndex < participantNames.length) {
        nameMap.set(pid, participantNames[nameIndex]);
        nameIndex++;
      }
    }

    let unknownCount = 1;
    for (const pid of uniqueParticipants) {
      if (!nameMap.has(pid)) {
        nameMap.set(pid, `Participant ${unknownCount++}`);
      }
    }

    return nameMap;
  }

  private mapSpeakerLabelsToParticipants(
    transcript: RawTranscriptSegment[],
    visual: VisualObservation[]
  ): Map<string, { participantId: string; name: string }> {
    const labelMap = new Map<string, { participantId: string; name: string }>();

    const segmentsByLabel = new Map<string, RawTranscriptSegment[]>();
    for (const seg of transcript) {
      if (!seg.speakerLabel) continue;
      const existing = segmentsByLabel.get(seg.speakerLabel) || [];
      existing.push(seg);
      segmentsByLabel.set(seg.speakerLabel, existing);
    }

    for (const [label, segments] of segmentsByLabel) {
      const participantScores = new Map<string, number>();

      for (const seg of segments) {
        const overlapping = visual.filter(
          (v) =>
            v.timestamp >= seg.startTime &&
            v.timestamp <= seg.endTime &&
            v.isSpeaking &&
            v.speakingConfidence > 0.3
        );

        for (const obs of overlapping) {
          const score = participantScores.get(obs.participantId) || 0;
          participantScores.set(obs.participantId, score + obs.speakingConfidence);
        }
      }

      let bestPid = '';
      let bestScore = 0;
      for (const [pid, score] of participantScores) {
        if (score > bestScore) {
          bestScore = score;
          bestPid = pid;
        }
      }

      if (bestPid) {
        const name = visual.find((v) => v.participantId === bestPid)?.participantName || label;
        labelMap.set(label, { participantId: bestPid, name });
      }
    }

    return labelMap;
  }

  private analyzeExpressionsDuringSegment(
    observations: VisualObservation[]
  ): { dominant: Expression; confidence: number; distribution: { expression: Expression; percentage: number }[] } {
    if (observations.length === 0) {
      return {
        dominant: 'neutral',
        confidence: 0.5,
        distribution: [{ expression: 'neutral', percentage: 100 }],
      };
    }

    const counts = new Map<Expression, number>();
    for (const obs of observations) {
      counts.set(obs.expression, (counts.get(obs.expression) || 0) + 1);
    }

    let dominant: Expression = 'neutral';
    let maxCount = 0;
    for (const [expr, count] of counts) {
      if (count > maxCount) {
        dominant = expr;
        maxCount = count;
      }
    }

    const total = observations.length;
    const distribution = [...counts.entries()]
      .map(([expression, count]) => ({
        expression,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage);

    const avgConfidence = observations.reduce((s, o) => s + o.expressionConfidence, 0) / total;

    return { dominant, confidence: avgConfidence, distribution };
  }

  private assessEngagement(observations: VisualObservation[]): 'high' | 'medium' | 'low' {
    if (observations.length === 0) return 'medium';

    let engagementScore = 0;

    for (const obs of observations) {
      if (obs.headPose) {
        const lookingAway = Math.abs(obs.headPose.yaw) > 30 || Math.abs(obs.headPose.pitch) > 20;
        engagementScore += lookingAway ? -1 : 1;
      } else {
        engagementScore += 0.5;
      }

      if (obs.expression !== 'neutral' && obs.expression !== 'bored') {
        engagementScore += 0.5;
      }

      if (obs.isSpeaking) {
        engagementScore += 1;
      }
    }

    const avgScore = engagementScore / observations.length;
    if (avgScore > 1.0) return 'high';
    if (avgScore > 0.3) return 'medium';
    return 'low';
  }

  private buildParticipantSummaries(
    segments: DiarizedSegment[],
    visual: VisualObservation[],
    _nameMap: Map<string, string>
  ): DiarizedParticipant[] {
    const participantMap = new Map<string, DiarizedParticipant>();

    for (const seg of segments) {
      let participant = participantMap.get(seg.speakerId);
      if (!participant) {
        participant = {
          id: seg.speakerId,
          name: seg.speakerName,
          totalSpeakingTime: 0,
          speakingPercentage: 0,
          segmentCount: 0,
          dominantExpression: 'neutral',
          expressionTimeline: [],
          engagementLevel: 'medium',
          wordCount: 0,
        };
        participantMap.set(seg.speakerId, participant);
      }

      participant.totalSpeakingTime += seg.endTime - seg.startTime;
      participant.segmentCount++;
      participant.wordCount += seg.text.split(/\s+/).filter(Boolean).length;

      participant.expressionTimeline.push({
        time: seg.startTime,
        expression: seg.dominantExpression,
      });
    }

    const totalSpeaking = [...participantMap.values()].reduce(
      (s, p) => s + p.totalSpeakingTime, 0
    );

    for (const participant of participantMap.values()) {
      participant.speakingPercentage =
        totalSpeaking > 0
          ? Math.round((participant.totalSpeakingTime / totalSpeaking) * 100)
          : 0;

      // Find dominant expression
      const exprCounts = new Map<Expression, number>();
      for (const entry of participant.expressionTimeline) {
        exprCounts.set(entry.expression, (exprCounts.get(entry.expression) || 0) + 1);
      }
      let maxC = 0;
      for (const [expr, count] of exprCounts) {
        if (count > maxC) {
          participant.dominantExpression = expr;
          maxC = count;
        }
      }

      // Engagement from visual data
      const participantVisual = visual.filter((v) => v.participantId === participant.id);
      if (participantVisual.length > 0) {
        const engaged = participantVisual.filter(
          (v) => v.expression !== 'bored' && v.expression !== 'neutral'
        ).length;
        const ratio = engaged / participantVisual.length;
        participant.engagementLevel = ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low';
      }
    }

    return [...participantMap.values()];
  }
}
