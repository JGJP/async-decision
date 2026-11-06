import {
  decodeAnswersEnvelope,
  requireKey,
  trimUrl,
  type Provider,
  type ResolvedRequest,
} from "../provider.js";
import type { AnyQuestion, UnifiedAnswer } from "../types.js";

export interface TypeSafeOptions {
  apiKey: string;
  /** Defaults to `https://api.typesafe.ai`. */
  baseUrl?: string;
  /** Defaults to `jev-latest`. */
  model?: string;
  headers?: Record<string, string>;
}

/** TypeSafe Jev (System One). Wire contract verified against the live API. */
export function typeSafe(options: TypeSafeOptions): Provider {
  const apiKey = requireKey("TypeSafe", options.apiKey);
  const baseUrl = trimUrl(options.baseUrl ?? "https://api.typesafe.ai");
  const model = options.model ?? "jev-latest";
  const extra = options.headers ?? {};

  return {
    name: "typesafe",
    defaultModel: model,
    experimental: false,
    endpoint: () => `${baseUrl}/v1/systemone`,
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
