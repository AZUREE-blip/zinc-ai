/**
 * Server-Side AI Service
 *
 * Cloud AI generation (Anthropic Claude / OpenAI GPT) + Moltbook knowledge enrichment.
 * Used by the Slack bot and meetings pipeline — no Electron dependencies.
 */

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5-20250514',
  openai: 'gpt-4o',
};

const HUB_URL = process.env.HUB_URL || 'http://localhost:3100';
const COMPANY_ID = process.env.COMPANY_ID || 'default';

// ============================================
// AI CONFIG
// ============================================

interface AiConfig {
  provider: string;
  model: string;
  anthropicApiKey: string;
  openaiApiKey: string;
}

function getAiConfig(): AiConfig {
  return {
    provider: process.env.AI_PROVIDER || 'anthropic',
    model: process.env.AI_MODEL || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  };
}

// ============================================
// TEXT GENERATION
// ============================================

interface GenerateOptions {
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  enrichWithMoltbook?: boolean;
}

/**
 * Generate text using the configured cloud AI provider.
 * Optionally enriches the system prompt with Moltbook company knowledge.
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const config = getAiConfig();
  let systemPrompt = options.systemPrompt || 'You are a helpful AI assistant. Be concise and direct.';

  if (options.enrichWithMoltbook !== false) {
    systemPrompt = await enrichWithMoltbookKnowledge(prompt, systemPrompt);
  }

  const messages = options.messages || [{ role: 'user', content: prompt }];

  if (config.provider === 'anthropic' && config.anthropicApiKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    try {
      const message = await client.messages.create({
        model: config.model || DEFAULT_MODELS.anthropic,
        max_tokens: options.maxTokens || 1024,
        system: systemPrompt,
        messages: messages as any,
      }, { signal: AbortSignal.timeout(30000) });
      return message.content[0]?.type === 'text' ? message.content[0].text : '';
    } catch (err: any) {
      if (err.status === 401) throw new Error('Invalid Anthropic API key.');
      if (err.status === 429) throw new Error('Rate limited by Anthropic. Try again shortly.');
      if (err.status >= 500) throw new Error('Anthropic API temporarily unavailable.');
      throw err;
    }
  } else if (config.provider === 'openai' && config.openaiApiKey) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    try {
      const completion = await client.chat.completions.create({
        model: config.model || DEFAULT_MODELS.openai,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.3,
        messages: [{ role: 'system', content: systemPrompt }, ...messages] as any,
      });
      return completion.choices[0]?.message?.content || '';
    } catch (err: any) {
      if (err.status === 401) throw new Error('Invalid OpenAI API key.');
      if (err.status === 429) throw new Error('Rate limited by OpenAI. Try again shortly.');
      if (err.status >= 500) throw new Error('OpenAI API temporarily unavailable.');
      throw err;
    }
  }

  throw new Error('No API key configured for provider: ' + config.provider);
}

// ============================================
// JSON GENERATION (for meetings pipeline)
// ============================================

interface GenerateJsonOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface JsonResult {
  success: boolean;
  data: any;
  raw?: string;
  error?: string;
}

/**
 * Generate structured JSON using the configured cloud AI provider.
 * Extracts JSON from the response, handling both providers' JSON modes.
 */
export async function generateJson(
  prompt: string,
  options: GenerateJsonOptions = {}
): Promise<JsonResult> {
  const config = getAiConfig();
  const systemPrompt = options.systemPrompt || 'You are an expert analyst. Always respond with valid JSON.';

  try {
    if (config.provider === 'anthropic' && config.anthropicApiKey) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      const message = await client.messages.create({
        model: config.model || DEFAULT_MODELS.anthropic,
        max_tokens: options.maxTokens || 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return { success: true, data: JSON.parse(jsonMatch[0]), raw: text };
      }
      return { success: true, data: null, raw: text };
    } else if (config.provider === 'openai' && config.openaiApiKey) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: config.openaiApiKey });
      const completion = await client.chat.completions.create({
        model: config.model || DEFAULT_MODELS.openai,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      });
      const text = completion.choices[0]?.message?.content || '';
      try {
        return { success: true, data: JSON.parse(text), raw: text };
      } catch {
        return { success: true, data: null, raw: text };
      }
    }
    return { success: false, error: 'No AI provider configured', data: null };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
}

// ============================================
// MOLTBOOK KNOWLEDGE ENRICHMENT
// ============================================

/**
 * Enrich a system prompt with relevant company knowledge from Moltbook Hub.
 * Calls the Hub REST API directly (no Electron bridge needed).
 */
export async function enrichWithMoltbookKnowledge(
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  try {
    const keywords = userPrompt
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 8)
      .join(' ');

    if (!keywords) return systemPrompt;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${HUB_URL}/api/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: COMPANY_ID, keywords }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return systemPrompt;

    const results = await res.json() as any[];
    if (!results || results.length === 0) return systemPrompt;

    const knowledgeBlock = results
      .slice(0, 5)
      .map((r: any) => `- ${r.solution || r.content || r.summary || JSON.stringify(r)}`)
      .join('\n');

    return `${systemPrompt}\n\n## Company Context (from Moltbook)\nRelevant knowledge from the company brain:\n${knowledgeBlock}`;
  } catch {
    // Knowledge enrichment is best-effort, never block AI generation
    return systemPrompt;
  }
}
