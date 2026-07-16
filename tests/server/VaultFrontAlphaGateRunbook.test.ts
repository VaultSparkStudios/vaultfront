import { describe, expect, it } from "vitest";
import { buildVaultFrontAlphaGateRunbook } from "../../src/server/VaultFrontAlphaGateRunbook";
import {
  buildVaultFrontPlaytestPulseSummary,
  recordVaultFrontPlaytestPulse,
  resetVaultFrontPlaytestPulseForTests,
  type VaultFrontPlaytestPulseEvent,
} from "../../src/server/VaultFrontPlaytestPulse";
import { buildVaultFrontReadiness } from "../../src/server/VaultFrontReadiness";

const now = Date.parse("2026-06-14T12:00:00.000Z");

function seedReadyPulse(): ReturnType<
  typeof buildVaultFrontPlaytestPulseSummary
> {
  resetVaultFrontPlaytestPulseForTests();
  for (let actor = 1; actor <= 3; actor += 1) {
    const fixtureId = String(actor);
    recordHumanEvidence(
      { surface: "tutorial", event: "shown", at: now },
      fixtureId,
    );
    recordHumanEvidence(
      { surface: "tutorial", event: "advance", at: now },
      fixtureId,
    );
    recordHumanEvidence(
      { surface: "tutorial", event: "complete", at: now },
      fixtureId,
    );
    recordHumanEvidence(
      { surface: "match", event: "feedback", at: now },
      fixtureId,
    );
    recordHumanEvidence(
      { surface: "retention", event: "rival_challenge_shown", at: now },
      fixtureId,
    );
    recordHumanEvidence(
      { surface: "retention", event: "rival_requeue_clicked", at: now },
      fixtureId,
    );
  }
  return buildVaultFrontPlaytestPulseSummary(now + 60_000);
}

let humanEventSequence = 0;
function recordHumanEvidence(
  input: Omit<
    VaultFrontPlaytestPulseEvent,
    "source" | "actorKey" | "evidenceSessionId" | "eventId"
  >,
  fixtureId = "default",
) {
  return recordVaultFrontPlaytestPulse({
    ...input,
    value: 1,
    source: "human",
    actorKey: `human-actor-fixture-${fixtureId}`,
    evidenceSessionId: `human-session-fixture-${fixtureId}`,
    eventId: `human-event-fixture-${fixtureId}-${humanEventSequence++}`,
  });
}
describe("buildVaultFrontAlphaGateRunbook", () => {
  it("turns an empty pulse into an operator checklist without clearing warnings", () => {
    resetVaultFrontPlaytestPulseForTests();
    const pulse = buildVaultFrontPlaytestPulseSummary(now);
    const readiness = buildVaultFrontReadiness({
      healthy: true,
      processRole: "master",
      playtestPulse: pulse,
    });
    const runbook = buildVaultFrontAlphaGateRunbook({ pulse, readiness });

    expect(runbook.status).toBe("not-started");
    expect(runbook.readinessStatus).toBe("warn");
    expect(runbook.headline).toContain("guided first-match");
    expect(runbook.checklist.join(" ")).toContain("fresh-player match");
    expect(runbook.evidenceFields.join(" ")).toContain("failedChecks=");
    expect(runbook.warnings.join(" ")).toContain("Revenue remains unverified");
  });

  it("surfaces incomplete alpha evidence as concrete proof fields", () => {
    resetVaultFrontPlaytestPulseForTests();
    recordHumanEvidence({
      surface: "retention",
      event: "rival_challenge_shown",
      at: now,
    });
    const pulse = buildVaultFrontPlaytestPulseSummary(now + 60_000);
    const readiness = buildVaultFrontReadiness({
      healthy: true,
      processRole: "worker",
      playtestPulse: pulse,
    });
    const runbook = buildVaultFrontAlphaGateRunbook({ pulse, readiness });

    expect(runbook.status).toBe("warming");
    expect(runbook.evidenceFields).toContain(
      "failedChecks=sampleSize,tutorial,feedback,rivalAction",
    );
    expect(runbook.checklist.some((item) => item.includes("TODO"))).toBe(true);
  });

  it("keeps ready alpha evidence distinct from revenue evidence", () => {
    const pulse = seedReadyPulse();
    const readiness = buildVaultFrontReadiness({
      healthy: true,
      processRole: "worker",
      playtestPulse: pulse,
    });
    const runbook = buildVaultFrontAlphaGateRunbook({ pulse, readiness });

    expect(runbook.status).toBe("ready");
    expect(runbook.readinessStatus).toBe("pass");
    expect(runbook.evidenceFields).toContain("failedChecks=none");
    expect(runbook.successCriteria.join(" ")).toContain("Alpha gate passed");
    expect(runbook.warnings).toContain(
      "Revenue remains unverified; do not clear the revenue warning from alpha-gate evidence.",
    );
  });
});
