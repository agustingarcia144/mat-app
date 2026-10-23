"use client";

import { useState } from "react";
import { type Id } from "@/convex/_generated/dataModel";

import ActiveMembers from "@/components/features/dashboard/ActiveMembers";
import PlanificationStatus from "@/components/features/dashboard/PlanificationStatus";
import PaymentsOverview from "@/components/features/dashboard/PaymentsOverview";
import PendingActionsCard from "@/components/features/dashboard/PendingActionsCard";
import ClassesCard from "@/components/features/dashboard/ClassesCard";
import DashboardKpis from "@/components/features/dashboard/dashboard-kpis";
import PersonalizedDashboard from "@/components/features/dashboard/personalized-dashboard";
import QuickActions from "@/components/features/dashboard/quick-actions";
import {
  DashboardScopeProvider,
  useDashboardScope,
} from "@/components/features/dashboard/dashboard-scope-context";
import ScheduleDetailDialog from "@/components/features/classes/dialogs/schedule-detail-dialog";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { isOrgAdminRole } from "@/lib/security/roles";
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

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:space-y-6 md:py-10">
      <PersonalizedDashboard
        cards={{
          pending: <PendingActionsCard />,
          classes: showClasses ? (
            <ClassesCard onOpenDetail={handleOpenScheduleDetail} />
          ) : undefined,
          members: showMembers ? <ActiveMembers /> : undefined,
          payments: showPaymentsOverview ? <PaymentsOverview /> : undefined,
          planifications: showPlanifications ? (
            <PlanificationStatus />
          ) : undefined,
        }}
      >
        <QuickActions />
        <DashboardKpis />
      </PersonalizedDashboard>

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
