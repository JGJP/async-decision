# async-decision

Typed ESM client for **decision models** — the category of models that take
`state` plus named, typed questions and return one calibrated answer each (a
choice, score, yes/no probability, or box), with no generated text.

One unified interface, swappable providers:

| Provider | `provider` | Status |
| --- | --- | --- |
| TypeSafe Jev (System One) | `"typesafe"` | ✅ verified |
| OpenAI Decisions | `"openai"` | ⚠️ experimental |
| Perplexity Decider | `"perplexity"` | ⚠️ experimental |
| Cloudflare Clef (Workers AI) | `"cloudflare"` | ⚠️ experimental |

> **Experimental providers** are reconstructed from public docs, not verified
> against the live API. Their `endpoint`/`encode`/`decode` are isolated in
> `src/providers/*` so correcting a wire shape is a one-file change.

```bash
npm install async-decision
```

## Usage

```ts
import { createClient, noul, choice, score } from "async-decision";

const client = createClient({
  provider: "typesafe",
  apiKey: process.env.TYPESAFE_API_KEY!,
});

const { answers, provider, usage } = await client.decide({
  state: { message: "My card keeps getting declined, this is ridiculous." },
  questions: {
    billing: noul("Is this message about billing?"),
    tone: choice("What is the customer's tone?", {
      angry: "Upset or hostile",
      calm: "Neutral or polite",
    }),
    urgency: score("How urgent is this?", [
      "Can wait",
      "Needs attention this week",
      "Needs attention today",
    ]),
  },
});

answers.billing.noul;       // number 0..1
answers.tone.choice;        // "angry" | "calm"  (inferred from criteria keys)
answers.tone.probabilities; // Record<"angry" | "calm", number>
answers.urgency.score;      // number across the ordered levels
```

## Switching providers

The call shape is identical; only the `provider` name changes. Config is typed
per provider:

```ts
createClient({ provider: "openai", apiKey });
createClient({ provider: "perplexity", apiKey });
createClient({ provider: "cloudflare", apiKey, accountId });
createClient({ provider: "typesafe", apiKey, model: "jev-1.14.0" });
```

Each provider requires `apiKey` and accepts `{ baseUrl, model, headers }`
(Cloudflare also requires `accountId`). The client never reads credentials from
the environment — pass them in explicitly. For advanced use you can still pass a
factory result or a custom `Provider` instead of a name.

## Writing your own provider

Implement the `Provider` interface — the client owns transport, your provider
owns the wire format:

```ts
import { createClient, type Provider, decodeAnswersEnvelope } from "async-decision";

const myProvider: Provider = {
  name: "acme",
  defaultModel: "acme-decider-1",
  experimental: true,
  endpoint: () => "https://api.acme.example/decide",
  headers: () => ({ Authorization: `Bearer ${process.env.ACME_KEY}`, "Content-Type": "application/json" }),
  encode: (req) => ({ model: req.model, state: req.state, questions: req.questions }),
  decode: (raw, questions) => decodeAnswersEnvelope(raw, questions),
};

createClient({ provider: myProvider });
```

`decodeAnswersEnvelope` is a tolerant decoder for the common
`{ answers: { name: {...} } }` shape with sensible field fallbacks.

## CLI

The package ships an `async-decision` binary (also `npx async-decision`):

```bash
async-decision \
  -S "my card keeps getting declined, this is ridiculous" \
  -n "billing: is this about billing?" \
  -c "tone: customer tone = angry,calm,excited" \
  -s "urgency: how urgent = can wait | this week | today"
# typesafe · jev-latest
#   billing: 0.98  (yes-probability)
#   tone: angry  (confidence 1)  [angry 1, calm 0, excited 0]
#   urgency: 1.97  (confidence 0.97)
```

State comes from `-S/--state`, `--state-file`, or stdin. Pick a provider with
`-p/--provider`; the key is read from `-k/--api-key` or the provider's env var
(`TYPESAFE_API_KEY`, `OPENAI_API_KEY`, ...). Add `--json` for the full response.
Run `async-decision --help` for all flags.

## Primitives

| Builder | Answer fields |
| --- | --- |
| `noul(instructions, criteria?)` | `noul: number` |
| `choice(instructions, criteria)` | `choice`, `confidence`, `probabilities` |
| `score(instructions, levels)` | `score`, `confidence`, `legend`, `probabilities` |
| `box(instructions)` | `box: {top,bottom,left,right}`, `confidence` |

`confidence` summarizes how concentrated the distribution is — not whether it is
safe to act. Pick thresholds against your own data.

## Client options & per-request

```ts
createClient({
  provider,
  defaultHeaders,  // merged under every request
  fetch,           // inject a fetch impl; default: global fetch
});

client.decide({ state, questions, model, assets, headers, signal });
```

## Errors

Non-2xx responses throw `DecisionError` with `.provider`, `.status`, and
`.detail` (the API's `detail`/`error` payload or validation issues).
