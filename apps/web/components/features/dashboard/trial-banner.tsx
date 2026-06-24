"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";

function daysLeft(trialEndsAt: number | undefined) {
  if (!trialEndsAt) return 0;
  return Math.max(
    0,
    Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

export default function TrialBanner() {
  const entitlement = useOrganizationEntitlement();

  if (!entitlement || entitlement.billingStatus !== "trial") {
    return null;
  }

  const days = daysLeft(entitlement.trialEndsAt);
  const label =
    days > 0
      ? `Prueba Pro: te ${days === 1 ? "queda" : "quedan"} ${days} ${
          days === 1 ? "día" : "días"
        }`
      : "Tu prueba Pro termina hoy";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FF5C24]/40 bg-[#FF5C24]/5 px-4 py-3 text-sm mt-4">
      <span className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4 text-[#FF5C24]" />
        {label}
      </span>
      <Link
        href="/dashboard/billing"
        className="font-semibold text-[#FF5C24] underline-offset-4 hover:underline"
      >
        Mejorar ahora
      </Link>
    </div>
  );
}
