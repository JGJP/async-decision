import type {
  AnyQuestion,
  Asset,
  State,
  UnifiedAnswer,
} from "./types.js";

export interface ResolvedRequest {
  model: string;
  state: State;
  questions: Record<string, AnyQuestion>;
  assets?: Record<string, Asset>;
}

/**
 * A provider maps the unified request/response to one API's wire format.
 * Implementations are swappable strategies: the client owns transport (fetch,
 * headers merge, error handling); the provider owns the URL, auth headers, body
 * encoding, and answer decoding.
 */
export interface Provider {
  readonly name: string;
  readonly defaultModel: string;
  /**
   * `true` when the wire contract is reconstructed from docs rather than
   * verified against the live API. Verify before relying on it in production.
   */
  readonly experimental: boolean;
  endpoint(): string;
  headers(): Record<string, string>;
  encode(req: ResolvedRequest): unknown;
  decode(
    raw: unknown,
    questions: Record<string, AnyQuestion>,
  ): Record<string, UnifiedAnswer>;
}

export function requireKey(provider: string, key: string): string {
  if (!key) {
    throw new Error(`Missing ${provider} API key: pass { apiKey }.`);
  }
  return key;
}

export function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Tolerant decoder for the unified answer shapes. Competitor providers whose
 * exact field names are unverified read through here with sensible fallbacks.
 */
export function normalizeAnswer(
  questionType: AnyQuestion["type"],
  raw: unknown,
): UnifiedAnswer {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (...vals: unknown[]): number => {
    for (const v of vals) if (typeof v === "number") return v;
    return NaN;
  };

  switch (questionType) {
    case "noul":
      return { type: "noul", noul: num(o.noul, o.probability, o.yes, o.true) };
    case "choice":
      return {
        type: "choice",
        choice: String(o.choice ?? o.decision ?? o.label ?? o.selected ?? ""),
        confidence: num(o.confidence),
        probabilities: (o.probabilities ?? o.probs ?? {}) as Record<
          string,
          number
        >,
      };
    case "score":
      return {
        type: "score",
        score: num(o.score, o.rating, o.value),
        confidence: num(o.confidence),
        legend: (o.legend ?? {}) as Record<string, string>,
        probabilities: (o.probabilities ?? o.probs ?? {}) as Record<
          string,
          number
        >,
      };
    case "box": {
      const b = (o.box ?? o) as Record<string, unknown>;
      return {
        type: "box",
        box: {
          top: num(b.top),
          bottom: num(b.bottom),
          left: num(b.left),
          right: num(b.right),
        },
        confidence: typeof o.confidence === "number" ? o.confidence : null,
      };
    }
  }
}

/** Decode an `{ answers: { name: {...} } }` body against the asked questions. */
export function decodeAnswersEnvelope(
  raw: unknown,
  questions: Record<string, AnyQuestion>,
): Record<string, UnifiedAnswer> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const answers = (body.answers ?? body) as Record<string, unknown>;
  const out: Record<string, UnifiedAnswer> = {};
  for (const [name, q] of Object.entries(questions)) {
    out[name] = normalizeAnswer(q.type, answers[name]);
  }
  return out;
}
