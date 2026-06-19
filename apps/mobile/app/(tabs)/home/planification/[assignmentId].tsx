import React from "react";
import { Authenticated, AuthLoading } from "convex/react";
import type { Href } from "expo-router";
import { AssignmentDetailContent } from "@/components/features/planifications";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { SubscriptionGate } from "@/components/shared/subscription-gate";

// Rendered inside the home stack (not a redirect to the profile tab) so that
// opening a planification from the workout session keeps it on the home stack —
// pressing back returns to the [sessionId] screen instead of the profile root.
export default function WorkoutPlanificationScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <SubscriptionGate loadingFallback={<LoadingScreen />}>
          <AssignmentDetailContent
            getExerciseHref={(ex) =>
              `/home/exercise/${ex.exerciseId}?dayExerciseId=${ex._id}` as Href
            }
          />
        </SubscriptionGate>
      </Authenticated>
    </>
  );
}
