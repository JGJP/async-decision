export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export type ErrorDetail =
  | string
  | ValidationIssue[]
  | Record<string, unknown>;

export class DecisionError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly detail: ErrorDetail;

  constructor(provider: string, status: number, detail: ErrorDetail) {
    super(
      typeof detail === "string"
        ? detail
        : `${provider} request failed (${status})`,
    );
    this.name = "DecisionError";
    this.provider = provider;
    this.status = status;
    this.detail = detail;
  }
}
