import { z } from "zod";
import {
  type MatchResultCertificate,
  MatchResultCertificateSchema,
} from "../core/Schemas";
import {
  canonicalEvidenceDigest,
  verifyMatchResultCertificate,
} from "./MatchResultCertificate";

const MAX_INPUT_DEPTH = 12;
const MAX_INPUT_NODES = 10_000;
const MAX_INPUT_STRING_CHARS = 16_384;
const MAX_CACHE_ENTRIES = 10_000;
const MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_PROVIDER_OUTPUT_CHARS = 16_384;

export const CanonicalAiFeatureSchema = z.enum(["oracle", "recap", "coach"]);
export type CanonicalAiFeature = z.infer<typeof CanonicalAiFeatureSchema>;

const SafeIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:@-]+$/);

const SafeNarrativeSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_200)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      }),
    { message: "Narrative contains control characters" },
  )
  .refine((value) => !/<\/?(?:script|iframe|object|embed)\b/iu.test(value), {
    message: "Narrative contains active markup",
  });

const OraclePredictionSchema = z
  .object({
    playerId: SafeIdentifierSchema,
    deltaIfWin: z.number().int().min(0).max(64),
    deltaIfLoss: z.number().int().min(-64).max(0),
    threat: SafeIdentifierSchema.optional(),
  })
  .strict()
  .refine((value) => value.threat !== value.playerId, {
    message: "A player cannot be their own threat",
    path: ["threat"],
  });

export const OracleOutputSchema = z
  .object({
    predictions: z.array(OraclePredictionSchema).min(2).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    const playerIDs = value.predictions.map((entry) => entry.playerId);
    if (new Set(playerIDs).size !== playerIDs.length) {
      context.addIssue({
        code: "custom",
        message: "Oracle predictions must have unique player IDs",
        path: ["predictions"],
      });
    }
  });
export type OracleOutput = z.infer<typeof OracleOutputSchema>;

export const RecapOutputSchema = z
  .object({ recap: SafeNarrativeSchema.min(40) })
  .strict();
export type RecapOutput = z.infer<typeof RecapOutputSchema>;

const CoachMomentSchema = z
  .object({
    tick: z.number().int().min(0).max(100_000_000),
    decision: SafeNarrativeSchema.max(256),
    optimal: SafeNarrativeSchema.max(256),
    why: SafeNarrativeSchema.max(384),
  })
  .strict();

export const CoachOutputSchema = z.array(CoachMomentSchema).min(2).max(3);
export type CoachOutput = z.infer<typeof CoachOutputSchema>;

export interface CanonicalAiEvidence {
  readonly schemaVersion: "1.0";
  readonly feature: CanonicalAiFeature;
  readonly gameID: string;
  readonly certificateId: string;
  readonly requester: string | null;
  readonly canonicalInputsDigest: string;
  readonly evidenceDigest: string;
  readonly cacheKey: string;
  readonly source: {
    readonly configDigest: string;
    readonly turnsDigest: string;
    readonly resultDigest: string;
  };
}

export interface CanonicalAiResponseReceipt {
  readonly schemaVersion: "1.0";
  readonly feature: CanonicalAiFeature;
  readonly evidenceDigest: string;
  readonly outputDigest: string;
  readonly provider: "anthropic";
  readonly model: string;
  readonly generatedAt: string;
  readonly receiptDigest: string;
}

export type CanonicalAiReceiptEvidence = Pick<
  CanonicalAiEvidence,
  "feature" | "evidenceDigest"
>;

export class CanonicalAiEvidenceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CanonicalAiEvidenceError";
  }
}

function assertBoundedCanonicalInput(
  value: unknown,
  state = { nodes: 0 },
  depth = 0,
): void {
  state.nodes++;
  if (state.nodes > MAX_INPUT_NODES)
    throw new CanonicalAiEvidenceError("canonical-input-node-limit");
  if (depth > MAX_INPUT_DEPTH)
    throw new CanonicalAiEvidenceError("canonical-input-depth-limit");
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "bigint"
  )
    return;
  if (typeof value === "string") {
    if (value.length > MAX_INPUT_STRING_CHARS)
      throw new CanonicalAiEvidenceError("canonical-input-string-limit");
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value)
      assertBoundedCanonicalInput(entry, state, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new CanonicalAiEvidenceError("canonical-input-not-plain-data");
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (key.length > 256)
        throw new CanonicalAiEvidenceError("canonical-input-key-limit");
      if (entry === undefined)
        throw new CanonicalAiEvidenceError("canonical-input-undefined");
      assertBoundedCanonicalInput(entry, state, depth + 1);
    }
    return;
  }
  throw new CanonicalAiEvidenceError("canonical-input-unsupported-type");
}

function immutableClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const clone: unknown = Array.isArray(value)
    ? value.map((entry) => immutableClone(entry))
    : Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          immutableClone(entry),
        ]),
      );
  return Object.freeze(clone) as T;
}

export function buildCanonicalAiEvidence(input: {
  feature: CanonicalAiFeature;
  certificate: MatchResultCertificate;
  canonicalInputs: unknown;
  requester?: string | null;
}): CanonicalAiEvidence {
  const feature = CanonicalAiFeatureSchema.parse(input.feature);
  const parsedCertificate = MatchResultCertificateSchema.safeParse(
    input.certificate,
  );
  if (
    !parsedCertificate.success ||
    !verifyMatchResultCertificate(parsedCertificate.data)
  ) {
    throw new CanonicalAiEvidenceError("invalid-result-certificate");
  }
  const requester =
    input.requester === undefined || input.requester === null
      ? null
      : SafeIdentifierSchema.parse(input.requester);
  if (feature === "coach" && requester === null)
    throw new CanonicalAiEvidenceError("coach-requester-required");

  assertBoundedCanonicalInput(input.canonicalInputs);
  const canonicalInputsDigest = canonicalEvidenceDigest(input.canonicalInputs);
  const certificate = parsedCertificate.data;
  const evidenceCore = {
    schemaVersion: "1.0" as const,
    feature,
    gameID: certificate.gameID,
    certificateId: certificate.certificateId,
    requester,
    canonicalInputsDigest,
    source: {
      configDigest: certificate.config.digest,
      turnsDigest: certificate.turns.digest,
      resultDigest: certificate.result.digest,
    },
  };
  const evidenceDigest = canonicalEvidenceDigest(evidenceCore);
  return immutableClone({
    ...evidenceCore,
    evidenceDigest,
    cacheKey: `vaultfront-ai:v1:${feature}:${evidenceDigest}`,
  });
}

export function buildCanonicalAiResponseReceipt(input: {
  evidence: CanonicalAiReceiptEvidence;
  output: unknown;
  provider: "anthropic";
  model: string;
  generatedAt?: string;
}): CanonicalAiResponseReceipt {
  if (!/^claude-[a-z0-9-]{1,80}$/.test(input.model))
    throw new CanonicalAiEvidenceError("invalid-provider-model");
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt)))
    throw new CanonicalAiEvidenceError("invalid-receipt-timestamp");
  assertBoundedCanonicalInput(input.output);
  const core = {
    schemaVersion: "1.0" as const,
    feature: input.evidence.feature,
    evidenceDigest: input.evidence.evidenceDigest,
    outputDigest: canonicalEvidenceDigest(input.output),
    provider: input.provider,
    model: input.model,
    generatedAt,
  };
  return immutableClone({
    ...core,
    receiptDigest: canonicalEvidenceDigest(core),
  });
}

export function verifyCanonicalAiResponseReceipt(
  receipt: CanonicalAiResponseReceipt,
  evidence: CanonicalAiReceiptEvidence,
  output: unknown,
): boolean {
  try {
    const { receiptDigest, ...core } = receipt;
    return (
      receipt.schemaVersion === "1.0" &&
      receipt.feature === evidence.feature &&
      receipt.evidenceDigest === evidence.evidenceDigest &&
      receipt.outputDigest === canonicalEvidenceDigest(output) &&
      receiptDigest === canonicalEvidenceDigest(core)
    );
  } catch {
    return false;
  }
}

function parseProviderJson(raw: string): unknown {
  if (raw.length === 0 || raw.length > MAX_PROVIDER_OUTPUT_CHARS)
    throw new CanonicalAiEvidenceError("provider-output-size-invalid");
  if (/```/u.test(raw))
    throw new CanonicalAiEvidenceError("provider-output-markdown-wrapper");
  try {
    return JSON.parse(raw);
  } catch {
    throw new CanonicalAiEvidenceError("provider-output-invalid-json");
  }
}

export function parseOracleProviderOutput(
  raw: string,
  expectedPlayerIDs?: readonly string[],
): OracleOutput {
  const output = OracleOutputSchema.parse(parseProviderJson(raw));
  if (expectedPlayerIDs) {
    const expected = [...new Set(expectedPlayerIDs)].sort();
    const actual = output.predictions.map((entry) => entry.playerId).sort();
    if (
      expected.length !== expectedPlayerIDs.length ||
      expected.length !== actual.length ||
      expected.some((playerID, index) => playerID !== actual[index]) ||
      output.predictions.some(
        (entry) =>
          entry.threat !== undefined && !expected.includes(entry.threat),
      )
    ) {
      throw new CanonicalAiEvidenceError(
        "provider-output-oracle-roster-mismatch",
      );
    }
  }
  return output;
}

export function parseRecapProviderOutput(raw: string): RecapOutput {
  return RecapOutputSchema.parse({ recap: raw });
}

export function parseCoachProviderOutput(
  raw: string,
  maxTick?: number,
): CoachOutput {
  const output = CoachOutputSchema.parse(parseProviderJson(raw));
  if (
    maxTick !== undefined &&
    (!Number.isInteger(maxTick) ||
      maxTick < 0 ||
      output.some((moment) => moment.tick > maxTick))
  ) {
    throw new CanonicalAiEvidenceError("provider-output-coach-tick-mismatch");
  }
  return output;
}

export class BoundedTtlCache<T> {
  private readonly entries = new Map<
    string,
    { readonly value: T; readonly expiresAt: number }
  >();

  constructor(
    private readonly options: {
      maxEntries: number;
      ttlMs: number;
      now?: () => number;
    },
  ) {
    if (
      !Number.isInteger(options.maxEntries) ||
      options.maxEntries < 1 ||
      options.maxEntries > MAX_CACHE_ENTRIES
    )
      throw new RangeError("maxEntries outside safe bounds");
    if (
      !Number.isInteger(options.ttlMs) ||
      options.ttlMs < 1 ||
      options.ttlMs > MAX_CACHE_TTL_MS
    )
      throw new RangeError("ttlMs outside safe bounds");
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private purgeExpired(now = this.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Map insertion order is the LRU order; reads move the entry to the tail.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (key.length === 0 || key.length > 256)
      throw new RangeError("cache key outside safe bounds");
    const now = this.now();
    this.purgeExpired(now);
    this.entries.delete(key);
    while (this.entries.size >= this.options.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, {
      value: immutableClone(value),
      expiresAt: now + this.options.ttlMs,
    });
  }

  get size(): number {
    this.purgeExpired();
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

export class AiDeadlineError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`ai-deadline-exceeded:${timeoutMs}`);
    this.name = "AiDeadlineError";
  }
}

export async function withAiDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new RangeError("AI deadline outside safe bounds");
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new AiDeadlineError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
