/**
 * Provider-agnostic decision-model types and question builders.
 *
 * The category (TypeSafe Jev, OpenAI Decisions, Perplexity Decider, Cloudflare
 * Clef, ...) converged on the same shape: supply `state` plus named, typed
 * questions and get back one calibrated answer per question — no generated text.
 * These types are the unified surface; each provider maps them to its wire.
 */

export type State = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: "noul";
  instructions: State;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion<C extends Record<string, string>> {
  type: "choice";
  instructions: State;
  criteria: C;
}

export interface ScoreQuestion {
  type: "score";
  instructions: State;
  criteria: readonly string[];
}

export interface BoxQuestion {
  type: "box";
  instructions: State;
}

export type AnyQuestion =
  | NoulQuestion
  | ChoiceQuestion<Record<string, string>>
  | ScoreQuestion
  | BoxQuestion;

export interface NoulAnswer {
  type: "noul";
  /** Probability of "yes", 0..1. */
  noul: number;
}

export interface ChoiceAnswer<K extends string> {
  type: "choice";
  choice: K;
  /** Concentration of the distribution, 0..1 — not workflow correctness. */
  confidence: number;
  probabilities: Record<K, number>;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted position across the ordered levels. */
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export interface BoxAnswer {
  type: "box";
  box: { top: number; bottom: number; left: number; right: number };
  confidence: number | null;
}

export type UnifiedAnswer =
  | NoulAnswer
  | ChoiceAnswer<string>
  | ScoreAnswer
  | BoxAnswer;

/** Maps each question to the answer type a decision model returns for it. */
export type AnswerFor<Q extends AnyQuestion> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer C>
    ? ChoiceAnswer<Extract<keyof C, string>>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : Q extends BoxQuestion
        ? BoxAnswer
        : never;

export type Answers<Q extends Record<string, AnyQuestion>> = {
  [K in keyof Q]: AnswerFor<Q[K]>;
};

export interface Asset {
  type: "image";
  format: "png" | "jpg" | "jpeg";
  data_base64: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

// Question builders — carry literal key types so answers infer precisely.

export function noul(
  instructions: State,
  criteria?: { true: string; false: string },
): NoulQuestion {
  return criteria === undefined
    ? { type: "noul", instructions }
    : { type: "noul", instructions, criteria };
}

export function choice<const C extends Record<string, string>>(
  instructions: State,
  criteria: C,
): ChoiceQuestion<C> {
  return { type: "choice", instructions, criteria };
}

export function score<const L extends readonly string[]>(
  instructions: State,
  levels: L,
): ScoreQuestion {
  return { type: "score", instructions, criteria: levels };
}

export function box(instructions: State): BoxQuestion {
  return { type: "box", instructions };
}
