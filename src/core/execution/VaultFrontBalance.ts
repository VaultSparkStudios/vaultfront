import balanceAuthority from "../../../config/vaultfront-balance.v1.json";
import type { VaultConvoyRewardTuning } from "../configuration/Config";

export const VAULTFRONT_BALANCE_AUTHORITY = balanceAuthority;
export const DEFAULT_VAULT_CONVOY_REWARD_TUNING = Object.freeze(
  balanceAuthority.tuning,
) satisfies Readonly<VaultConvoyRewardTuning>;
export const DEFAULT_VAULT_PRESSURE_CONFIG = Object.freeze(
  balanceAuthority.pressure,
);

export interface ConvoyRewardInputs {
  ownerStrength: number;
  averageStrength: number;
  distance: number;
  routeRisk: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  rewardScale: number;
}

export interface ConvoyRewardPlan {
  goldReward: bigint;
  troopsReward: number;
  rewardMultiplier: number;
  rewardScale: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  riskMultiplier: number;
  baselineGold: number;
  distanceGold: number;
  rewardMath: string;
}

export function planConvoyReward(
  input: ConvoyRewardInputs,
  tuning: Readonly<VaultConvoyRewardTuning> = DEFAULT_VAULT_CONVOY_REWARD_TUNING,
): ConvoyRewardPlan {
  const distance = Math.max(0, input.distance);
  const routeRisk = Math.max(0, Math.min(1, input.routeRisk));
  const riskMultiplier =
    tuning.riskMultiplierBase + routeRisk * tuning.riskMultiplierScale;
  const rewardMultiplier = Math.max(
    tuning.rewardMultiplierMin,
    Math.min(
      tuning.rewardMultiplierMax,
      input.strengthMultiplier *
        input.phaseMultiplier *
        riskMultiplier *
        input.rewardScale,
    ),
  );
  const ownerStrength = Math.max(0, input.ownerStrength);
  const averageStrength = Math.max(0, input.averageStrength);
  const baselineGold = Math.max(
    tuning.minGoldReward,
    Math.floor(
      (ownerStrength * tuning.baselineGoldOwnerStrengthScale +
        averageStrength * tuning.baselineGoldAvgStrengthScale) *
        (tuning.baselineGoldRiskBase +
          routeRisk * tuning.baselineGoldRiskScale),
    ),
  );
  const distanceGold = Math.max(
    tuning.distanceGoldMin,
    Math.floor(
      (ownerStrength * tuning.distanceGoldOwnerStrengthScale +
        tuning.distanceGoldFlat) *
        (tuning.distanceGoldRiskBase +
          routeRisk * tuning.distanceGoldRiskScale),
    ),
  );
  const goldReward = BigInt(
    Math.floor((baselineGold + distance * distanceGold) * rewardMultiplier),
  );
  const troopsReward = Math.max(
    tuning.minTroopsReward,
    Math.floor(
      (Math.sqrt(Math.max(1, baselineGold)) * tuning.troopsSqrtGoldScale +
        distance *
          (tuning.troopsDistanceBase +
            routeRisk * tuning.troopsDistanceRiskScale)) *
        rewardMultiplier,
    ),
  );
  return {
    goldReward,
    troopsReward,
    rewardMultiplier,
    rewardScale: input.rewardScale,
    strengthMultiplier: input.strengthMultiplier,
    phaseMultiplier: input.phaseMultiplier,
    riskMultiplier,
    baselineGold,
    distanceGold,
    rewardMath:
      `Gold=(${baselineGold}+${distance}*${distanceGold})x${rewardMultiplier.toFixed(2)} | ` +
      `Troops=max(${tuning.minTroopsReward},f(distance,risk)x${rewardMultiplier.toFixed(2)})`,
  };
}
