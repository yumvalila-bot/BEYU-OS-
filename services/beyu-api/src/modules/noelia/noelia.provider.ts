/**
 * The language-model boundary for Noelia (spec §41, §58, §59, §60).
 *
 * IMPLEMENTATION STATUS
 * ---------------------
 *   NoeliaProvider (interface)   IMPLEMENTED — the contract every provider meets.
 *   StubNoeliaProvider           STUBBED     — deterministic, no network, no model.
 *   OpenAiCompatibleProvider     STUBBED     — shape is real, the call is not wired.
 *
 * The default in every environment except production is the stub. It answers
 * from the grounding facts it is given and nothing else. It is NOT an
 * analyst — it does not reason, and it must never be described to a user as
 * if it does. `StubNoeliaProvider.model` is literally 'stub-deterministic' so
 * that the value recorded on every message makes the provenance obvious in the
 * database years from now.
 *
 * WHY THE BOUNDARY LOOKS LIKE THIS
 * --------------------------------
 * The provider receives `NoeliaPromptContext`, never a database handle, never
 * a SecurityContext, and never a repository. Everything it can see has already
 * passed through authorization and `minimizeForAi`. That is what makes "the AI
 * has no unrestricted data access" (spec §58) a structural property rather
 * than a policy someone has to remember: there is no path from here to the
 * data, so there is nothing to forget.
 */

import type { BeyuConfig } from '@beyu/config';

/**
 * One fact the model is permitted to see, already minimized and already
 * authorized for the requesting principal.
 */
export interface GroundingFact {
  /** Where it came from, e.g. 'organization' or 'os-registry'. */
  source: string;
  /** Stable identifier of the underlying record, for citation. */
  ref: string;
  label: string;
  detail: string;
}

export interface NoeliaPromptContext {
  question: string;
  /** Prior turns, oldest first. Already scoped to this conversation. */
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>;
  facts: GroundingFact[];
  /** Display name only. No email, no identifiers, no roles beyond these. */
  principalDisplayName: string;
  principalRoles: string[];
}

export interface NoeliaCompletion {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Refs of the facts the answer actually rests on. Drives the citations. */
  citedRefs: string[];
  /**
   * True when the provider could not ground its answer in the supplied facts.
   * The controller surfaces this rather than presenting a guess as knowledge.
   */
  ungrounded: boolean;
}

export interface NoeliaProvider {
  readonly kind: 'stub' | 'openai-compatible';
  readonly model: string;
  complete(context: NoeliaPromptContext): Promise<NoeliaCompletion>;
}

/**
 * The system prompt. Kept here, in version control, and never assembled from
 * user input: prompt text is part of the governance posture and reviewers must
 * be able to read what the model was told.
 */
export const NOELIA_SYSTEM_PROMPT = [
  'You are Noelia, the executive intelligence layer of BEYU OS, the control',
  'plane for BEYU FAMILY TRUST.',
  '',
  'Absolute rules:',
  '- You never execute anything. You describe and you recommend.',
  '- You answer only from the supplied facts. If they are insufficient, say so',
  '  plainly and name what is missing. Never fill a gap with a plausible guess.',
  '- You never state an ownership percentage, a waterfall percentage, or a',
  '  country regulation that is not present verbatim in the supplied facts.',
  '- Governance stops at the Sector LLC boundary. Questions about sector',
  '  operations belong to that sector\u2019s own OS.',
  '- The parent entity is BEYU FAMILY TRUST. It is never called anything else.',
].join('\n');

/**
 * Deterministic, offline provider. STUBBED.
 *
 * It composes an answer out of the grounding facts by simple term overlap.
 * This is retrieval and formatting, not analysis, and the wording it produces
 * says so. Determinism is deliberate: the e2e suite asserts on governance
 * behaviour, and a nondeterministic model would make those assertions flaky
 * for reasons that have nothing to do with the governance being tested.
 */
export class StubNoeliaProvider implements NoeliaProvider {
  readonly kind = 'stub' as const;
  readonly model = 'stub-deterministic';

  async complete(context: NoeliaPromptContext): Promise<NoeliaCompletion> {
    const terms = tokenize(context.question);
    const scored = context.facts
      .map((fact) => ({ fact, score: overlap(terms, tokenize(`${fact.label} ${fact.detail}`)) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const tokensIn = estimateTokens(
      NOELIA_SYSTEM_PROMPT + context.question + context.facts.map((f) => f.detail).join(' '),
    );

    if (scored.length === 0) {
      const content = [
        `I cannot answer that from what I am allowed to see.`,
        '',
        context.facts.length === 0
          ? 'No control-plane records were in scope for this question.'
          : `I hold ${context.facts.length} record(s) in scope — ` +
            `${[...new Set(context.facts.map((f) => f.source))].join(', ')} — ` +
            'and none of them bear on what you asked.',
        '',
        'Rather than guess, I would rather tell you where to look. Ask me about',
        'the organizational hierarchy, the registered operating systems, or the',
        'audit trail, or narrow the question to a specific entity by name.',
      ].join('\n');
      return {
        content,
        model: this.model,
        tokensIn,
        tokensOut: estimateTokens(content),
        citedRefs: [],
        ungrounded: true,
      };
    }

    const lines = [
      `Based on ${scored.length} record(s) currently in scope for you:`,
      '',
      ...scored.map((entry) => `\u2022 ${entry.fact.label} \u2014 ${entry.fact.detail}`),
      '',
      'That is a direct reading of the control-plane records, not an analysis.',
      'This deployment runs the deterministic stub provider, so treat the',
      'grouping above as retrieval; the judgement is yours.',
    ];
    const content = lines.join('\n');

    return {
      content,
      model: this.model,
      tokensIn,
      tokensOut: estimateTokens(content),
      citedRefs: scored.map((entry) => entry.fact.ref),
      ungrounded: false,
    };
  }
}

/**
 * OpenAI-compatible chat provider. STUBBED — DO NOT ENABLE.
 *
 * The request shape below is correct for the common /v1/chat/completions
 * contract, but the call is not made, because:
 *   1. no credential is available in this environment, and
 *   2. sending trust governance data to a third party is a decision for the
 *      Trust, taken with a data-processing agreement in place, not a default
 *      an engineer switches on.
 *
 * To complete this: resolve `config.ai.apiKeyRef` through the deployment's
 * secret manager, POST `buildRequestBody()` to `${baseUrl}/chat/completions`
 * with an AbortSignal at `requestTimeoutMs`, and map the response back into
 * NoeliaCompletion. Leave the grounding and citation logic exactly as it is.
 */
export class OpenAiCompatibleProvider implements NoeliaProvider {
  readonly kind = 'openai-compatible' as const;
  readonly model: string;

  constructor(private readonly config: BeyuConfig['ai']) {
    this.model = config.model;
  }

  buildRequestBody(context: NoeliaPromptContext): Record<string, unknown> {
    return {
      model: this.config.model,
      max_tokens: this.config.maxOutputTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: NOELIA_SYSTEM_PROMPT },
        {
          role: 'system',
          content:
            'Authorized facts (the ONLY data you may use):\n' +
            context.facts.map((f) => `[${f.ref}] ${f.label}: ${f.detail}`).join('\n'),
        },
        ...context.history.map((turn) => ({
          role: turn.role === 'USER' ? 'user' : 'assistant',
          content: turn.content,
        })),
        { role: 'user', content: context.question },
      ],
    };
  }

  async complete(): Promise<NoeliaCompletion> {
    throw new Error(
      'The openai-compatible Noelia provider is STUBBED and intentionally not ' +
        'wired to a network call. Set AI_DRIVER=stub for offline operation, or ' +
        'complete the adapter and have the integration reviewed before enabling it.',
    );
  }
}

export function createNoeliaProvider(config: BeyuConfig['ai']): NoeliaProvider {
  return config.driver === 'openai-compatible'
    ? new OpenAiCompatibleProvider(config)
    : new StubNoeliaProvider();
}

// --- helpers ---------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'what', 'which', 'who', 'how', 'why', 'do', 'does', 'i', 'we',
  'me', 'my', 'our', 'show', 'list', 'tell', 'about', 'with', 'that', 'this',
  'it', 'be', 'can', 'you', 'please', 'give',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const term of a) if (b.has(term)) count += 1;
  return count;
}

/** Rough token estimate. Only ever used for cost telemetry, never for billing. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
