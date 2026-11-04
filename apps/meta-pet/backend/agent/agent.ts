import { createOpenAI } from '@ai-sdk/openai';
import { defineAgent } from 'eve';

// The hackathon calls Meta directly; its key remains on this server.
const meta = createOpenAI({
  baseURL: 'https://api.meta.ai/v1',
  // An explicit empty value prevents fallback to an unrelated OPENAI_API_KEY.
  apiKey: process.env.MODEL_API_KEY ?? '',
});

export default defineAgent({
  model: meta.responses(process.env.MODEL_NAME ?? 'muse-spark-1.3'),
  modelContextWindowTokens: 1_048_576,
  defaultTools: false,
  modelOptions: { providerOptions: { openai: { store: false } } },
  limits: { sessionTimeoutMs: 30 * 60 * 1_000 },
});
