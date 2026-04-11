import React from "react";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/expo";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { SubscriptionGate } from "@/components/shared/subscription-gate";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { PlanificationsNativeList } from "@/components/features/profile/planifications-native-list";
import type { PlanificationListItem } from "@/components/features/profile/profile-native-list.types";

function PlanificationsListContent() {
  const { user } = useUser();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const backgroundColor = isDark ? "#000" : "#fff";

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : "skip",
  );

  const planificationItems = React.useMemo(() => {
    const toItem = (
      assignment: NonNullable<typeof assignments>[number],
    ): PlanificationListItem => {
      const name = assignment.planification?.name ?? "Planificación";
      const weeksCount =
        "weeksCount" in assignment
          ? (assignment as { weeksCount: number }).weeksCount
          : 0;
      const startDate = assignment.startDate
        ? format(new Date(assignment.startDate), "d MMM yyyy", { locale: es })
        : null;
      const endDate = assignment.endDate
        ? format(new Date(assignment.endDate), "d MMM yyyy", { locale: es })
        : null;
      const dateRange =
        startDate && endDate
          ? `${startDate} – ${endDate}`
          : startDate
            ? `Desde ${startDate}`
            : endDate
              ? `Hasta ${endDate}`
              : null;

      return {
        id: assignment._id,
        name,
        weeksLabel: weeksCount === 1 ? "1 semana" : `${weeksCount} semanas`,
        dateRange,
      };
    };

    return {
      active: (assignments ?? [])
        .filter((assignment) => assignment.status === "active")
        .map(toItem),
      other: (assignments ?? [])
        .filter((assignment) => assignment.status !== "active")
        .map(toItem),
    };
  }, [assignments]);

  return (
    <PlanificationsNativeList
      isDark={isDark}
      backgroundColor={backgroundColor}
      loading={assignments === undefined}
      active={planificationItems.active}
      other={planificationItems.other}
      onOpen={(assignmentId) =>
        router.push(`/profile/planifications/${assignmentId}` as Href)
      }
    />
  );
}

export default function ProfilePlanificationsScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <SubscriptionGate loadingFallback={<LoadingScreen />}>
          <PlanificationsListContent />
        </SubscriptionGate>
      </Authenticated>
    </>
  );
}
