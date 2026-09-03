import type { FunctionReturnType } from "convex/server";
import { api } from "@repo/convex";

export type RewardsData = NonNullable<
  FunctionReturnType<typeof api.rewards.getMyRewards>
>;
export type RewardDefinition = RewardsData["rewards"][number];
export type RewardLedgerEntry = RewardsData["ledger"][number];
export type RewardRedemption = RewardsData["redemptions"][number];

export const REDEMPTION_STATUS_LABELS = {
  requested: "Solicitado",
  ready: "Listo para retirar",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
} as const;

export type RewardAvailability = {
  canRedeem: boolean;
  label: string;
  reason?: string;
  tone: "available" | "locked" | "soldOut";
  missingPoints: number;
};

export function getRewardAvailability(
  reward: RewardDefinition,
  data: RewardsData,
): RewardAvailability {
  const missingPoints = Math.max(0, reward.pointsCost - data.account.balance);
  if (reward.availableQuantity !== undefined && reward.availableQuantity < 1) {
    return {
      canRedeem: false,
      label: "Agotado",
      reason: "No hay unidades disponibles por el momento.",
      tone: "soldOut",
      missingPoints,
    };
  }

  const previousRedemptions = data.redemptions.filter(
    (item) =>
      String(item.rewardDefinitionId) === String(reward._id) &&
      item.status !== "cancelled",
  ).length;
  if (
    reward.perMemberLimit !== undefined &&
    previousRedemptions >= reward.perMemberLimit
  ) {
    return {
      canRedeem: false,
      label: "Límite alcanzado",
      reason: "Ya alcanzaste el límite de canjes para este beneficio.",
      tone: "locked",
      missingPoints,
    };
  }

  if (missingPoints > 0) {
    return {
      canRedeem: false,
      label: `Te faltan ${missingPoints}`,
      reason: `Todavía te faltan ${missingPoints} ${data.settings.pointsName}.`,
      tone: "locked",
      missingPoints,
    };
  }

  return {
    canRedeem: true,
    label: "Disponible",
    tone: "available",
    missingPoints: 0,
  };
}

export function sortRewards(data: RewardsData): RewardDefinition[] {
  return [...data.rewards].sort((a, b) => {
    const aOut = a.availableQuantity !== undefined && a.availableQuantity < 1;
    const bOut = b.availableQuantity !== undefined && b.availableQuantity < 1;
    if (aOut !== bOut) return aOut ? 1 : -1;
    return a.pointsCost - b.pointsCost;
  });
}

export function getFeaturedReward(
  data: RewardsData,
): RewardDefinition | undefined {
  const inStock = sortRewards(data).filter(
    (reward) =>
      reward.availableQuantity === undefined || reward.availableQuantity > 0,
  );
  return (
    inStock.find((reward) => getRewardAvailability(reward, data).canRedeem) ??
    inStock.find((reward) => reward.pointsCost > data.account.balance) ??
    inStock[0]
  );
}

export type PrimaryProgress = {
  kind: "weekly" | "streak" | "reward" | "balance";
  eyebrow: string;
  value: string;
  message: string;
  progress: number;
  accent: "orange" | "amber" | "blue";
};

export function getPrimaryProgress(data: RewardsData): PrimaryProgress {
  const weeklyTarget = data.progress.weeklyTarget;
  if (data.settings.weeklyBonusEnabled && weeklyTarget) {
    const count = Math.min(data.progress.weeklyAttendances, weeklyTarget);
    const remaining = Math.max(0, weeklyTarget - count);
    return {
      kind: "weekly",
      eyebrow: "META SEMANAL",
      value: `${count}/${weeklyTarget}`,
      message:
        remaining === 0
          ? "¡Meta cumplida! Seguí cuidando tu racha."
          : remaining === 1
            ? "Te falta 1 visita para completar la semana."
            : `Te faltan ${remaining} visitas para completar la semana.`,
      progress: count / weeklyTarget,
      accent: "orange",
    };
  }

  const streakTarget = data.progress.streakTarget;
  if (data.settings.streaksEnabled && streakTarget) {
    const nextIn = data.progress.nextStreakBonusIn ?? streakTarget;
    const segmentProgress = nextIn === 0 ? streakTarget : streakTarget - nextIn;
    return {
      kind: "streak",
      eyebrow: "TU RACHA",
      value: `${data.progress.currentStreakDays} días`,
      message:
        nextIn === 0
          ? "¡Bono de racha conseguido!"
          : nextIn === 1
            ? "Una visita más para tu próximo bono."
            : `${nextIn} visitas para tu próximo bono.`,
      progress: segmentProgress / streakTarget,
      accent: "amber",
    };
  }

  const featured = getFeaturedReward(data);
  if (featured) {
    const remaining = Math.max(0, featured.pointsCost - data.account.balance);
    return {
      kind: "reward",
      eyebrow: "PRÓXIMO BENEFICIO",
      value: `${data.account.balance}`,
      message:
        remaining === 0
          ? `${featured.name} ya está a tu alcance.`
          : `Te faltan ${remaining} ${data.settings.pointsName} para ${featured.name}.`,
      progress: Math.min(1, data.account.balance / featured.pointsCost),
      accent: "blue",
    };
  }

  return {
    kind: "balance",
    eyebrow: "TU SALDO",
    value: `${data.account.balance}`,
    message: `Seguí entrenando para sumar ${data.settings.pointsName}.`,
    progress: data.account.balance > 0 ? 1 : 0,
    accent: "blue",
  };
}

export function rewardDate(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}
