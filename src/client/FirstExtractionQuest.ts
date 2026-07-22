export const FIRST_EXTRACTION_TITLE = "First Extraction";

export interface FirstExtractionStep {
  key: "focusSet" | "vaultCaptured" | "convoyAction" | "pulseTriggered";
  label: string;
}

export const FIRST_EXTRACTION_STEPS: readonly FirstExtractionStep[] = [
  { key: "focusSet", label: "Set Resource Focus once" },
  { key: "vaultCaptured", label: "Capture one vault" },
  { key: "convoyAction", label: "Shield or intercept one Vault Convoy" },
  { key: "pulseTriggered", label: "Trigger one Defense Factory pulse" },
];

export const FIRST_EXTRACTION_ORIENTATION = [
  {
    icon: "🏦",
    title: "Find the First Extraction tracker",
    body: "The live tracker beside your vault controls is the source of truth. It advances from your real match actions—no separate tutorial checklist to reconcile.",
  },
  {
    icon: "🚛",
    title: "Extract, then expand",
    body: "Capture a vault and affect its first convoy. Advanced Shield, Reroute, and Jam Breaker coaching unlocks only after that core extraction is complete.",
  },
] as const;

export function firstExtractionComplete(
  progress: Record<FirstExtractionStep["key"], boolean>,
): boolean {
  return FIRST_EXTRACTION_STEPS.every((step) => progress[step.key]);
}
