import { DecisionError, type ErrorDetail } from "./errors.js";
import type { Provider, ResolvedRequest } from "./provider.js";
import {
  cloudflareClef,
  type CloudflareClefOptions,
} from "./providers/cloudflare.js";
import {
  openaiDecisions,
  type OpenAIDecisionsOptions,
} from "./providers/openai.js";
import {
  perplexityDecider,
  type PerplexityDeciderOptions,
} from "./providers/perplexity.js";
import { typeSafe, type TypeSafeOptions } from "./providers/typesafe.js";
import type {
  AnyQuestion,
  Answers,
  Asset,
  State,
  Usage,
} from "./types.js";

export type ProviderName =
  | "typesafe"
  | "openai"
  | "perplexity"
  | "cloudflare";

interface TransportOptions {
  /** Injected fetch; defaults to global `fetch` (Node 18+). */
  fetch?: typeof fetch;
  /** Headers merged under each request (over the provider's own headers). */
  defaultHeaders?: Record<string, string>;
}

/**
 * Pick a provider by name with its own typed config, or pass a custom
 * `Provider` instance. Config keys are specific to the chosen provider
 * (e.g. `cloudflare` also takes `accountId`).
 */
export type DecisionClientOptions = TransportOptions &
  (
    | ({ provider: "typesafe" } & TypeSafeOptions)
    | ({ provider: "openai" } & OpenAIDecisionsOptions)
    | ({ provider: "perplexity" } & PerplexityDeciderOptions)
    | ({ provider: "cloudflare" } & CloudflareClefOptions)
    | { provider: Provider }
  );

function resolveProvider(options: DecisionClientOptions): Provider {
  const p = options.provider;
  if (typeof p !== "string") return p;
  switch (p) {
    case "typesafe":
      return typeSafe(options as TypeSafeOptions);
    case "openai":
      return openaiDecisions(options as OpenAIDecisionsOptions);
    case "perplexity":
      return perplexityDecider(options as PerplexityDeciderOptions);
    case "cloudflare":
      return cloudflareClef(options as CloudflareClefOptions);
  }
}

export interface DecideRequest<Q extends Record<string, AnyQuestion>> {
  state: State;
  questions: Q;
  /** Overrides the provider's default model. */
  model?: string;
  assets?: Record<string, Asset>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface DecisionResponse<Q extends Record<string, AnyQuestion>> {
  provider: string;
  model: string;
  answers: Answers<Q>;
  usage?: Usage;
  /** The provider's untouched response, for provider-specific fields. */
  raw: unknown;
}

/** A decision-model client: one `decide()` call over any provider. */
export interface DecisionClient {
  readonly provider: Provider;
  decide<Q extends Record<string, AnyQuestion>>(
    request: DecideRequest<Q>,
  ): Promise<DecisionResponse<Q>>;
}

/** Create a client. No `new` — pick a provider by name or pass a `Provider`. */
export function createClient(options: DecisionClientOptions): DecisionClient {
  const provider = resolveProvider(options);
  const defaultHeaders = options.defaultHeaders ?? {};
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("No global fetch available; pass { fetch } (Node 18+).");
  }

  return {
    provider,
    async decide<Q extends Record<string, AnyQuestion>>(
      request: DecideRequest<Q>,
    ): Promise<DecisionResponse<Q>> {
      const model = request.model ?? provider.defaultModel;
      const resolved: ResolvedRequest = {
        model,
        state: request.state,
        questions: request.questions,
        ...(request.assets ? { assets: request.assets } : {}),
      };

      const res = await fetchImpl(provider.endpoint(), {
        method: "POST",
        headers: {
          ...provider.headers(),
          ...defaultHeaders,
          ...request.headers,
        },
        body: JSON.stringify(provider.encode(resolved)),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      const text = await res.text();
      const raw: unknown = text ? JSON.parse(text) : null;

      if (!res.ok) {
        throw new DecisionError(
          provider.name,
          res.status,
          extractDetail(raw, text || res.statusText),
        );
      }

      const answers = provider.decode(raw, request.questions) as Answers<Q>;
      const usage = extractUsage(raw);

      return {
        provider: provider.name,
        model,
        answers,
        ...(usage ? { usage } : {}),
        raw,
      };
    },
  };
}

function extractDetail(raw: unknown, fallback: string): ErrorDetail {
  if (raw && typeof raw === "object" && "detail" in raw) {
    return (raw as { detail: ErrorDetail }).detail;
  }
  if (raw && typeof raw === "object" && "error" in raw) {
    return (raw as { error: ErrorDetail }).error;
  }
  return fallback;
}

function extractUsage(raw: unknown): Usage | undefined {
  if (raw && typeof raw === "object" && "usage" in raw) {
    return (raw as { usage: Usage }).usage;
  }
  return undefined;
}
