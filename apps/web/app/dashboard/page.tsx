"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";

import ActiveMembers from "@/components/features/dashboard/ActiveMembers";
import PlanificationStatus from "@/components/features/dashboard/PlanificationStatus";
import PaymentsOverview from "@/components/features/dashboard/PaymentsOverview";
import PendingActionsCard from "@/components/features/dashboard/PendingActionsCard";
import ClassesCard from "@/components/features/dashboard/ClassesCard";
import DashboardKpis from "@/components/features/dashboard/dashboard-kpis";
import DashboardHeader from "@/components/features/dashboard/dashboard-header";
import QuickActions from "@/components/features/dashboard/quick-actions";
import {
  DashboardScopeProvider,
  useDashboardScope,
} from "@/components/features/dashboard/dashboard-scope-context";
import ScheduleDetailDialog from "@/components/features/classes/dialogs/schedule-detail-dialog";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { isOrgAdminRole } from "@/lib/security/roles";
import { cn } from "@/lib/utils";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";

function DashboardContent() {
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    Id<"classSchedules"> | undefined
  >();
  const { role } = useDashboardScope();
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

  // Left: what needs doing today. Right: how the gym is doing (members and
  // money first), with the long Planificaciones list closing the column.
  const hasSideColumn =
    showMembers || showPaymentsOverview || showPlanifications;

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:space-y-6 md:py-10">
      <DashboardHeader />
      <QuickActions />
      <DashboardKpis />

      <div
        className={cn(
          "grid items-start gap-4",
          hasSideColumn && "lg:grid-cols-2 lg:gap-6",
        )}
      >
        <div className="min-w-0 space-y-4">
          <PendingActionsCard />
          {showClasses && (
            <ClassesCard onOpenDetail={handleOpenScheduleDetail} />
          )}
        </div>
        {hasSideColumn && (
          <div className="min-w-0 space-y-4">
            {showMembers && <ActiveMembers />}
            {showPaymentsOverview && <PaymentsOverview />}
            {showPlanifications && <PlanificationStatus />}
          </div>
        )}
      </div>

      {showClasses && selectedScheduleId && (
        <ScheduleDetailDialog
          open={scheduleDetailOpen}
          onOpenChange={handleClose}
          scheduleId={selectedScheduleId}
        />
      )}
    </DashboardPageContainer>
  );
}

export default function Page() {
  return (
    <DashboardScopeProvider>
      <DashboardContent />
    </DashboardScopeProvider>
  );
}
