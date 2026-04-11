import { Redirect, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";

export default function WorkoutPlanificationRedirect() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId?: string }>();

  return (
    <Redirect
      href={
        assignmentId
          ? (`/profile/planifications/${assignmentId}` as Href)
          : ("/profile" as Href)
      }
    />
  );
}
