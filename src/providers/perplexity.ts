import {
  decodeAnswersEnvelope,
  requireKey,
  trimUrl,
  type Provider,
  type ResolvedRequest,
} from "../provider.js";
import type { AnyQuestion, UnifiedAnswer } from "../types.js";

export interface PerplexityDeciderOptions {
  apiKey: string;
  /** Defaults to `https://api.perplexity.ai`. */
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
}

/**
 * Perplexity Decider. EXPERIMENTAL: reconstructed from public descriptions
 * (shared state + named questions, Jev-like). Verify before production use.
 */
export function perplexityDecider(
  options: PerplexityDeciderOptions,
): Provider {
  const apiKey = requireKey("Perplexity", options.apiKey);
  const baseUrl = trimUrl(options.baseUrl ?? "https://api.perplexity.ai");
  const model = options.model ?? "decider";
  const extra = options.headers ?? {};

  return {
    name: "perplexity",
    defaultModel: model,
    experimental: true,
    endpoint: () => `${baseUrl}/decisions`,
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    }),
    encode(req: ResolvedRequest) {
      const body: Record<string, unknown> = {
        model: req.model,
        state: req.state,
        questions: req.questions,
      };
      if (req.assets) body.assets = req.assets;
      return body;
    },
    decode(
      raw: unknown,
      questions: Record<string, AnyQuestion>,
    ): Record<string, UnifiedAnswer> {
      return decodeAnswersEnvelope(raw, questions);
    },
  };
}
