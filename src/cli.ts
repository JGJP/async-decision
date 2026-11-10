#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  createClient,
  box,
  choice,
  noul,
  score,
  DecisionError,
  type AnyQuestion,
  type DecisionClientOptions,
  type ProviderName,
  type State,
} from "./index.js";

const HELP = `async-decision — run a decision-model query from the terminal

Usage:
  async-decision [options]

Provider:
  -p, --provider <name>   typesafe | openai | perplexity | cloudflare  (default: typesafe)
  -k, --api-key <key>     API key (or env TYPESAFE_API_KEY / OPENAI_API_KEY /
                          PERPLEXITY_API_KEY / CLOUDFLARE_API_TOKEN)
  -m, --model <model>     override the provider's default model
      --account-id <id>   Cloudflare account id (or env CLOUDFLARE_ACCOUNT_ID)

Input:
  -S, --state <text>      state text (if omitted, read from stdin)
      --state-file <path> read state from a file (.json is parsed as JSON)

Questions (repeatable):
  -n, --noul   "id: instructions"
  -c, --choice "id: instructions = key1,key2,..."
  -s, --score  "id: instructions = level1 | level2 | ..."
  -q, --questions <json>  full questions object as JSON (merged in)

Output:
      --json              print raw JSON { provider, model, answers, usage }
  -h, --help
  -v, --version

Example:
  async-decision -S "my card keeps getting declined" \\
    -n "billing: is this about billing?" \\
    -c "tone: customer tone = angry,calm,excited"
`;

const ENV_KEY: Record<ProviderName, string> = {
  typesafe: "TYPESAFE_API_KEY",
  openai: "OPENAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  cloudflare: "CLOUDFLARE_API_TOKEN",
};

interface Args {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
  accountId?: string;
  state?: string;
  stateFile?: string;
  questions: Record<string, AnyQuestion>;
  json: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function splitId(spec: string): [string, string] {
  const i = spec.indexOf(":");
  if (i === -1) fail(`question needs "id: instructions" — got "${spec}"`);
  return [spec.slice(0, i).trim(), spec.slice(i + 1).trim()];
}

function parseInstrAndOptions(rest: string): [string, string] {
  const i = rest.lastIndexOf("=");
  if (i === -1) fail(`question needs "= options" — got "${rest}"`);
  return [rest.slice(0, i).trim(), rest.slice(i + 1).trim()];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { provider: "typesafe", questions: {}, json: false };
  const next = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined) fail(`${flag} needs a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    let flag = argv[i] as string;
    let inline: string | undefined;
    const eq = flag.startsWith("--") ? flag.indexOf("=") : -1;
    if (eq !== -1) {
      inline = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    const val = (): string => {
      if (inline !== undefined) return inline;
      const v = next(i, flag);
      i++;
      return v;
    };

    switch (flag) {
      case "-h":
      case "--help":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case "-v":
      case "--version":
        process.stdout.write(`${pkgVersion()}\n`);
        process.exit(0);
        break;
      case "-p":
      case "--provider": {
        const p = val();
        if (!(p in ENV_KEY)) fail(`unknown provider "${p}"`);
        args.provider = p as ProviderName;
        break;
      }
      case "-k":
      case "--api-key":
        args.apiKey = val();
        break;
      case "-m":
      case "--model":
        args.model = val();
        break;
      case "--account-id":
        args.accountId = val();
        break;
      case "-S":
      case "--state":
        args.state = val();
        break;
      case "--state-file":
        args.stateFile = val();
        break;
      case "-n":
      case "--noul": {
        const [id, instr] = splitId(val());
        args.questions[id] = noul(instr);
        break;
      }
      case "-c":
      case "--choice": {
        const [id, rest] = splitId(val());
        const [instr, opts] = parseInstrAndOptions(rest);
        const keys = opts.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length < 2) fail(`choice "${id}" needs 2+ options`);
        args.questions[id] = choice(
          instr,
          Object.fromEntries(keys.map((k) => [k, k])),
        );
        break;
      }
      case "-s":
      case "--score": {
        const [id, rest] = splitId(val());
        const [instr, opts] = parseInstrAndOptions(rest);
        const levels = opts.split("|").map((l) => l.trim()).filter(Boolean);
        if (levels.length < 2) fail(`score "${id}" needs 2+ levels`);
        args.questions[id] = score(instr, levels);
        break;
      }
      case "-b":
      case "--box": {
        const [id, instr] = splitId(val());
        args.questions[id] = box(instr);
        break;
      }
      case "-q":
      case "--questions": {
        let parsed: unknown;
        try {
          parsed = JSON.parse(val());
        } catch (e) {
          fail(`--questions is not valid JSON: ${(e as Error).message}`);
        }
        Object.assign(args.questions, parsed as Record<string, AnyQuestion>);
        break;
      }
      case "--json":
        args.json = true;
        break;
      default:
        fail(`unknown option "${flag}" (try --help)`);
    }
  }
  return args;
}

function pkgVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function resolveState(args: Args): State {
  let text: string | undefined = args.state;
  if (text === undefined && args.stateFile) {
    text = readFileSync(args.stateFile, "utf8");
    if (args.stateFile.endsWith(".json")) return JSON.parse(text) as State;
  }
  if (text === undefined && !process.stdin.isTTY) text = readStdin();
  if (text === undefined || text.trim() === "") {
    fail("no state: pass --state, --state-file, or pipe it on stdin");
  }
  return text;
}

function clientOptions(args: Args): DecisionClientOptions {
  const apiKey = args.apiKey ?? process.env[ENV_KEY[args.provider]];
  if (!apiKey) {
    fail(`missing api key: pass --api-key or set ${ENV_KEY[args.provider]}`);
  }
  const base = { apiKey, ...(args.model ? { model: args.model } : {}) };
  if (args.provider === "cloudflare") {
    const accountId = args.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      fail("cloudflare needs --account-id or CLOUDFLARE_ACCOUNT_ID");
    }
    return { provider: "cloudflare", accountId, ...base };
  }
  return { provider: args.provider, ...base };
}

function formatAnswer(id: string, a: Record<string, unknown>): string {
  switch (a.type) {
    case "noul":
      return `  ${id}: ${fmt(a.noul)}  (yes-probability)`;
    case "choice": {
      const probs = Object.entries(a.probabilities as Record<string, number>)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => `${k} ${fmt(v)}`)
        .join(", ");
      return `  ${id}: ${a.choice}  (confidence ${fmt(a.confidence)})  [${probs}]`;
    }
    case "score":
      return `  ${id}: ${fmt(a.score)}  (confidence ${fmt(a.confidence)})`;
    case "box":
      return `  ${id}: ${JSON.stringify(a.box)}`;
    default:
      return `  ${id}: ${JSON.stringify(a)}`;
  }
}

function fmt(n: unknown): string {
  return typeof n === "number" ? n.toFixed(3).replace(/\.?0+$/, "") : String(n);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (Object.keys(args.questions).length === 0) {
    fail("no questions: pass --noul/--choice/--score/--box or --questions");
  }
  const state = resolveState(args);
  const client = createClient(clientOptions(args));

  try {
    const res = await client.decide({ state, questions: args.questions });
    if (args.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      return;
    }
    process.stdout.write(`${res.provider} · ${res.model}\n`);
    for (const [id, a] of Object.entries(res.answers)) {
      process.stdout.write(
        formatAnswer(id, a as unknown as Record<string, unknown>) + "\n",
      );
    }
    if (res.usage) {
      process.stdout.write(
        `  — ${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens\n`,
      );
    }
  } catch (e) {
    if (e instanceof DecisionError) {
      fail(
        `${e.provider} ${e.status}: ${typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail)}`,
      );
    }
    throw e;
  }
}

main();
