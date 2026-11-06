import {
  decodeAnswersEnvelope,
  requireKey,
  trimUrl,
  type Provider,
  type ResolvedRequest,
} from "../provider.js";
import type { AnyQuestion, UnifiedAnswer } from "../types.js";

export interface CloudflareClefOptions {
  apiKey: string;
  /** Required: Workers AI is account-scoped. */
  accountId: string;
  /** Defaults to `https://api.cloudflare.com`. */
  baseUrl?: string;
  /** Workers AI model slug. */
  model?: string;
  headers?: Record<string, string>;
}

/**
 * Cloudflare Clef (open weights, run via Workers AI). EXPERIMENTAL: endpoint
 * shape follows the Workers AI `ai/run/{model}` convention; the Clef model slug
 * and body/response are reconstructed, not verified.
 */
export function cloudflareClef(options: CloudflareClefOptions): Provider {
  const apiKey = requireKey("Cloudflare", options.apiKey);
  const accountId = options.accountId;
  if (!accountId) {
    throw new Error("Missing Cloudflare account id: pass { accountId }.");
  }
  const baseUrl = trimUrl(options.baseUrl ?? "https://api.cloudflare.com");
  const model = options.model ?? "@cf/typesafe/clef";
  const extra = options.headers ?? {};

  return {
    name: "cloudflare",
    defaultModel: model,
    experimental: true,
    endpoint: () =>
      `${baseUrl}/client/v4/accounts/${accountId}/ai/run/${req_model(model)}`,
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    }),
    encode(req: ResolvedRequest) {
      return { state: req.state, questions: req.questions };
    },
    decode(
      raw: unknown,
      questions: Record<string, AnyQuestion>,
    ): Record<string, UnifiedAnswer> {
      // Workers AI wraps payloads in `{ result, success, errors }`.
      const body = (raw ?? {}) as Record<string, unknown>;
      const inner = "result" in body ? body.result : body;
      return decodeAnswersEnvelope(inner, questions);
    },
  };
}

function req_model(model: string): string {
  return model.replace(/^\/+/, "");
}
