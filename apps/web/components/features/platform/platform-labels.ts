import type { FunctionReturnType } from "convex/server";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { api } from "@/convex/_generated/api";
import type { BadgeProps } from "@/components/ui/badge";

export type PlatformOrgRow = FunctionReturnType<
  typeof api.platformInsights.listOrganizations
>[number];

export type PlatformCodeRow = FunctionReturnType<
  typeof api.orgCreationCodes.listOrgCreationCodes
>[number];

export type PlatformCodeStatus = PlatformCodeRow["status"];
export type PlatformBillingAccess = NonNullable<
  PlatformCodeRow["billingAccess"]
>;

export type PlatformSource = NonNullable<PlatformOrgRow["source"]>;
export type PlatformBillingStatus = PlatformOrgRow["billingStatus"];
export type PlatformPlanKey = "ultra" | "pro" | "lite";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export const EMPTY_VALUE = "—";

export const SOURCE_LABELS: Record<PlatformSource, string> = {
  mercadopago: "Mercado Pago",
  legacy: "Legacy",
  manual: "Manual",
  trial: "Prueba",
};

export const SOURCE_VARIANTS: Record<PlatformSource, BadgeVariant> = {
  mercadopago: "default",
  legacy: "secondary",
  manual: "muted",
  trial: "warning",
};

export const SOURCE_ORDER: PlatformSource[] = [
  "mercadopago",
  "legacy",
  "manual",
  "trial",
];

export const BILLING_STATUS_LABELS: Record<PlatformBillingStatus, string> = {
  active: "Activa",
  trial: "Prueba",
  grace_period: "En gracia",
  pending: "Pendiente",
  inactive: "Inactiva",
};

export const BILLING_STATUS_VARIANTS: Record<
  PlatformBillingStatus,
  BadgeVariant
> = {
  active: "success",
  trial: "warning",
  grace_period: "warning",
  pending: "muted",
  inactive: "destructive",
};

export const BILLING_STATUS_ORDER: PlatformBillingStatus[] = [
  "active",
  "trial",
  "grace_period",
  "pending",
  "inactive",
];

export const PLAN_LABELS: Record<PlatformPlanKey, string> = {
  ultra: "ULTRA",
  pro: "PRO",
  lite: "LITE",
};

export const PLAN_VARIANTS: Record<PlatformPlanKey, BadgeVariant> = {
  ultra: "default",
  pro: "outline",
  lite: "secondary",
};

export const PLAN_ORDER: PlatformPlanKey[] = ["ultra", "pro", "lite"];

export const CODE_STATUS_LABELS: Record<PlatformCodeStatus, string> = {
  active: "Activo",
  consumed: "Usado",
  revoked: "Revocado",
};

export const CODE_STATUS_VARIANTS: Record<PlatformCodeStatus, BadgeVariant> = {
  active: "success",
  consumed: "muted",
  revoked: "destructive",
};

export const CODE_STATUS_ORDER: PlatformCodeStatus[] = [
  "active",
  "consumed",
  "revoked",
];

/**
 * `billingAccess` collapses plan + origen into one field: a "legacy" code
 * redeems as PRO with source "legacy", a "lite" code as LITE with source
 * "manual". A code without the field behaves like "legacy".
 */
export const BILLING_ACCESS_LABELS: Record<PlatformBillingAccess, string> = {
  legacy: "Legacy (PRO)",
  lite: "Lite",
};

export const BILLING_ACCESS_VARIANTS: Record<
  PlatformBillingAccess,
  BadgeVariant
> = {
  legacy: "secondary",
  lite: "outline",
};

export const BILLING_ACCESS_ORDER: PlatformBillingAccess[] = ["legacy", "lite"];

export function getBillingAccessLabel(
  billingAccess: PlatformCodeRow["billingAccess"],
): string {
  return BILLING_ACCESS_LABELS[billingAccess ?? "legacy"];
}

/** Manual payments are refused server-side for MercadoPago-backed orgs. */
export function canRecordManualPayment(row: PlatformOrgRow): boolean {
  return row.source === "legacy" || row.source === "manual";
}

export function getSourceLabel(source: PlatformOrgRow["source"]): string {
  return source ? SOURCE_LABELS[source] : EMPTY_VALUE;
}

export function getPlanLabel(row: PlatformOrgRow): string {
  if (row.planName) return row.planName;
  if (row.planKey && row.planKey in PLAN_LABELS) {
    return PLAN_LABELS[row.planKey as PlatformPlanKey];
  }
  return EMPTY_VALUE;
}

export function getPlanVariant(row: PlatformOrgRow): BadgeVariant {
  if (row.planKey && row.planKey in PLAN_VARIANTS) {
    return PLAN_VARIANTS[row.planKey as PlatformPlanKey];
  }
  return "outline";
}

/**
 * Access expiry: the trial deadline while on trial, otherwise the end of the
 * current paid period.
 */
export function getExpiresAt(row: PlatformOrgRow): number | null {
  if (row.billingStatus === "trial") return row.trialEndsAt;
  return row.currentPeriodEnd ?? row.trialEndsAt;
}

export function formatDay(value: number | null | undefined): string {
  if (typeof value !== "number") return EMPTY_VALUE;
  return format(value, "dd/MM/yyyy", { locale: es });
}

export function formatRelative(value: number | null | undefined): string {
  if (typeof value !== "number") return EMPTY_VALUE;
  return formatDistanceToNow(value, { locale: es, addSuffix: true });
}
