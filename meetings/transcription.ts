/**
 * Transcription Service
 *
 * Converts audio to text using local Whisper (whisper.cpp via whisper-node)
 * or cloud AI (OpenAI Whisper API) as fallback.
 */

import type {
  TranscriptSegment,
  TranscriptionResult,
  TranscriptionConfig,
} from './types.js';

export class TranscriptionServiceImpl {
  private ready = false;
  private modelName: string | null = null;
  private error: string | null = null;

  async init(): Promise<void> {
    try {
      const available = await this.isLocalModelAvailable();
      if (available) {
        this.ready = true;
        this.modelName = 'whisper-base.en';
        console.log('TranscriptionService: Local Whisper model available');
      } else {
        console.log('TranscriptionService: No local model. Will use cloud AI fallback.');
      }
    } catch (err: any) {
      this.error = err.message;
      console.error('TranscriptionService init error:', err.message);
    }
  }

  getStatus() {
    return { ready: this.ready, model: this.modelName, error: this.error };
  }

  async isLocalModelAvailable(): Promise<boolean> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const modelsDir = path.join(process.cwd(), 'resources', 'models');
      const modelFiles = [
        'ggml-base.en.bin',
        'ggml-base.bin',
        'ggml-small.en.bin',
        'ggml-tiny.en.bin',
      ];
      for (const file of modelFiles) {
        if (fs.existsSync(path.join(modelsDir, file))) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async transcribeFile(audioPath: string, config?: TranscriptionConfig): Promise<TranscriptionResult> {
    if (this.ready) {
      try {
        return await this.transcribeWithLocalWhisper(audioPath, config);
      } catch (err: any) {
        console.error('Local Whisper failed, falling back to cloud:', err.message);
      }
    }
    return await this.transcribeWithCloudAI(audioPath, config);
  }

  async transcribeBuffer(audioBuffer: ArrayBuffer | Buffer, config?: TranscriptionConfig): Promise<TranscriptionResult> {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tempPath = path.join(os.tmpdir(), `zinc-audio-${Date.now()}.wav`);
    const buf = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(new Uint8Array(audioBuffer));
    fs.writeFileSync(tempPath, buf);

    try {
      const result = await this.transcribeFile(tempPath, config);
      fs.unlinkSync(tempPath);
      return result;
    } catch (err) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      throw err;
    }
  }

  private async transcribeWithLocalWhisper(audioPath: string, config?: TranscriptionConfig): Promise<TranscriptionResult> {
    try {
      // @ts-ignore - optional dependency, may not be installed
      const whisper = await import('whisper-node');
      const path = await import('path');
      const modelsDir = path.join(process.cwd(), 'resources', 'models');
      const modelPath = path.join(modelsDir, `ggml-${config?.modelSize || 'base'}.en.bin`);

      const result = await whisper.default(audioPath, {
        modelPath,
        language: config?.language || 'en',
      });

      const segments: TranscriptSegment[] = (result || []).map((seg: any, i: number) => ({
        id: `seg-${i}`,
        speakerName: 'Speaker',
        text: seg.speech || seg.text || '',
        startTime: seg.start || 0,
        endTime: seg.end || 0,
        confidence: 0.85,
        language: config?.language || 'en',
      }));

      return {
        segments,
        fullText: segments.map(s => s.text).join(' '),
        language: config?.language || 'en',
        duration: segments.length > 0 ? segments[segments.length - 1].endTime : 0,
      };
    } catch (err: any) {
      console.error('whisper-node not available:', err.message);
      throw new Error('Local Whisper not available: ' + err.message);
    }
  }

  private async transcribeWithCloudAI(audioPath: string, _config?: TranscriptionConfig): Promise<TranscriptionResult> {
    try {
      const fs = await import('fs');
      const { default: OpenAI } = await import('openai');

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('No OpenAI API key available for cloud transcription');
      }

      const client = new OpenAI({ apiKey });
      const audioFile = fs.createReadStream(audioPath);

      const response = await client.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile as any,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      const segments: TranscriptSegment[] = ((response as any).segments || []).map((seg: any, i: number) => ({
        id: `seg-${i}`,
        speakerName: 'Speaker',
        text: seg.text || '',
        startTime: seg.start || 0,
        endTime: seg.end || 0,
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.8,
        language: (response as any).language || 'en',
      }));

      return {
        segments,
        fullText: (response as any).text || segments.map(s => s.text).join(' '),
        language: (response as any).language || 'en',
        duration: segments.length > 0 ? segments[segments.length - 1].endTime : 0,
      };
    } catch (err: any) {
      console.error('Cloud transcription failed:', err.message);
      return { segments: [], fullText: '', language: 'en', duration: 0 };
    }
  }
}
