import ExerciseDetailContent from "@/components/features/exercises/exercise-detail-content";
import { SubscriptionGate } from "@/components/shared/subscription-gate";

export default function ExerciseDetailScreen() {
  return (
    <SubscriptionGate>
      <ExerciseDetailContent />
    </SubscriptionGate>
  );
}
