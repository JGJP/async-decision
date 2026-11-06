import {
  decodeAnswersEnvelope,
  requireKey,
  trimUrl,
  type Provider,
  type ResolvedRequest,
} from "../provider.js";
import type { AnyQuestion, UnifiedAnswer } from "../types.js";

export interface OpenAIDecisionsOptions {
  apiKey: string;
  /** Defaults to `https://api.openai.com`. */
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
}

/**
 * OpenAI Decisions API. EXPERIMENTAL: the wire contract below is reconstructed
 * from public descriptions, not verified. If OpenAI's live shape differs, only
 * `endpoint`/`encode`/`decode` here need to change.
 */
export function openaiDecisions(options: OpenAIDecisionsOptions): Provider {
  const apiKey = requireKey("OpenAI", options.apiKey);
  const baseUrl = trimUrl(options.baseUrl ?? "https://api.openai.com");
  const model = options.model ?? "gpt-decisions";
  const extra = options.headers ?? {};

  return {
    name: "openai",
    defaultModel: model,
    experimental: true,
    endpoint: () => `${baseUrl}/v1/decisions`,
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    }),
    encode(req: ResolvedRequest) {
      return {
        model: req.model,
        state: req.state,
        questions: req.questions,
      };
    },
    decode(
      raw: unknown,
      questions: Record<string, AnyQuestion>,
    ): Record<string, UnifiedAnswer> {
      return decodeAnswersEnvelope(raw, questions);
    },
  };
}
