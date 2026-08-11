"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import wolfiBg from "../../assets/mat-wolf-looking.png";

import ActiveMembers from "../../components/features/dashboard/ActiveMembers";
import PlanificationStatus from "@/components/features/dashboard/PlanificationStatus";
import NextClassCard from "@/components/features/dashboard/NextClassCard";
import PaymentsOverview from "@/components/features/dashboard/PaymentsOverview";
import PendingActionsCard from "@/components/features/dashboard/PendingActionsCard";
import TodayClassesCard from "@/components/features/dashboard/TodayClassesCard";
import MyCommissionCard from "@/components/features/dashboard/MyCommissionCard";
import DashboardHeader from "@/components/features/dashboard/dashboard-header";
import QuickActions from "@/components/features/dashboard/quick-actions";
import {
  DashboardScopeProvider,
  useDashboardScope,
} from "@/components/features/dashboard/dashboard-scope-context";
import ScheduleDetailDialog from "@/components/features/classes/dialogs/schedule-detail-dialog";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { isOrgAdminRole } from "@/lib/security/roles";

const GRID_CLASSES =
  "relative z-10 grid gap-4 md:gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.1fr)] xl:items-stretch xl:[&>*]:h-full";

function DashboardContent() {
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    Id<"classSchedules"> | undefined
  >();
  const { role, scope, myUserId } = useDashboardScope();
  const entitlement = useOrganizationEntitlement();

  const showPaymentsOverview =
    isOrgAdminRole(role) &&
    (entitlement?.dashboardCards.includes("payments") ?? false);
  const showClasses = entitlement?.dashboardCards.includes("classes") ?? false;
  const showMembers = entitlement?.dashboardCards.includes("members") ?? false;
  const showPlanifications =
    entitlement?.dashboardCards.includes("planifications") ?? false;

  const handleOpenScheduleDetail = (id: Id<"classSchedules">) => {
    setSelectedScheduleId(id);
    setScheduleDetailOpen(true);
  };

  const handleClose = () => {
    setScheduleDetailOpen(false);
    setSelectedScheduleId(undefined);
  };

  return (
    <div className="relative mx-auto w-full max-w-[1400px] space-y-4 p-4 md:space-y-6 md:p-6">
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-0 hidden -translate-x-1/2 -translate-y-1/2 md:block">
        <Image
          src={wolfiBg}
          alt="Wolf de fondo"
          priority
          className="h-auto w-[900px] select-none object-contain opacity-[0.10] saturate-75 contrast-95 brightness-95"
        />
      </div>

      <div className="relative z-10">
        <DashboardHeader />
      </div>

      <div className="relative z-10">
        <QuickActions />
      </div>

      <div className={GRID_CLASSES}>
        <PendingActionsCard />
        {showClasses ? (
          <TodayClassesCard onOpenDetail={handleOpenScheduleDetail} />
        ) : (
          <div aria-hidden="true" />
        )}
      </div>

      <div className={GRID_CLASSES}>
        {showMembers ? <ActiveMembers /> : <div aria-hidden="true" />}
        {showPaymentsOverview ? (
          <PaymentsOverview />
        ) : (
          <div aria-hidden="true" />
        )}
      </div>

      {/* Hidden entirely when the staff member has no commission configured. */}
      <div className={`${GRID_CLASSES} empty:hidden`}>
        <MyCommissionCard />
      </div>

      <div className={GRID_CLASSES}>
        {showPlanifications ? (
          <PlanificationStatus />
        ) : (
          <div aria-hidden="true" />
        )}
        {showClasses ? (
          <NextClassCard
            onOpenDetail={handleOpenScheduleDetail}
            pageSize={2}
            className="min-h-[460px] bg-background/60"
            inChargeUserId={scope === "mine" ? myUserId : undefined}
          />
        ) : (
          <div aria-hidden="true" />
        )}
      </div>

      {showClasses && selectedScheduleId && (
        <ScheduleDetailDialog
          open={scheduleDetailOpen}
          onOpenChange={handleClose}
          scheduleId={selectedScheduleId}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <DashboardScopeProvider>
      <DashboardContent />
    </DashboardScopeProvider>
  );
}
