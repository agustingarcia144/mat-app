"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BILLING_STATUS_LABELS,
  PLAN_LABELS,
  PLAN_ORDER,
  SOURCE_LABELS,
  SOURCE_ORDER,
  type PlatformOrgRow,
  type PlatformPlanKey,
  type PlatformSource,
} from "@/components/features/platform/platform-labels";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type BreakdownRow = { label: string; value: number };

function SummaryCard({
  title,
  value,
  hint,
  breakdown,
}: {
  title: string;
  value: string | number;
  hint?: string;
  breakdown?: BreakdownRow[];
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {breakdown && breakdown.length > 0 && (
          <ul className="mt-2 space-y-1">
            {breakdown.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span className="truncate">{item.label}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlatformSummaryCards({
  organizations,
}: {
  organizations: PlatformOrgRow[];
}) {
  // Pinned once on mount: "new in the last 30 days" must not drift between renders.
  const [now] = useState(() => Date.now());

  const summary = useMemo(() => {
    const since = now - THIRTY_DAYS_MS;

    const byPlan = new Map<PlatformPlanKey, number>();
    const bySource = new Map<PlatformSource, number>();
    let activeAccess = 0;
    let onTrial = 0;
    let newLast30Days = 0;
    let totalMembers = 0;

    for (const org of organizations) {
      if (org.planKey === "pro" || org.planKey === "lite") {
        byPlan.set(org.planKey, (byPlan.get(org.planKey) ?? 0) + 1);
      }
      if (org.source) {
        bySource.set(org.source, (bySource.get(org.source) ?? 0) + 1);
      }
      if (
        org.billingStatus === "active" ||
        org.billingStatus === "grace_period"
      )
        activeAccess += 1;
      if (org.billingStatus === "trial") onTrial += 1;
      if (org.createdAt >= since) newLast30Days += 1;
      totalMembers += org.activeMembers;
    }

    return {
      total: organizations.length,
      activeAccess,
      onTrial,
      newLast30Days,
      totalMembers,
      planBreakdown: PLAN_ORDER.filter((key) => byPlan.has(key)).map((key) => ({
        label: PLAN_LABELS[key],
        value: byPlan.get(key) ?? 0,
      })),
      sourceBreakdown: SOURCE_ORDER.filter((key) => bySource.has(key)).map(
        (key) => ({
          label: SOURCE_LABELS[key],
          value: bySource.get(key) ?? 0,
        }),
      ),
    };
  }, [organizations, now]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title="Organizaciones"
        value={summary.total}
        hint={`${summary.totalMembers} miembros activos en total`}
      />
      <SummaryCard
        title="Nuevas (30 días)"
        value={summary.newLast30Days}
        hint={`${summary.onTrial} en período de prueba`}
      />
      <SummaryCard
        title="Por plan"
        value={summary.activeAccess}
        hint={`${BILLING_STATUS_LABELS.active.toLowerCase()}s o en gracia`}
        breakdown={summary.planBreakdown}
      />
      <SummaryCard
        title="Por origen"
        value={summary.sourceBreakdown.reduce(
          (total, item) => total + item.value,
          0,
        )}
        hint="Con suscripción registrada"
        breakdown={summary.sourceBreakdown}
      />
    </div>
  );
}
