import ExerciseVideoSheetContent from "@/components/features/exercises/exercise-video-sheet-content";
import { SubscriptionGate } from "@/components/shared/subscription-gate";

export default function ExerciseVideoSheetScreen() {
  return (
    <SubscriptionGate>
      <ExerciseVideoSheetContent />
    </SubscriptionGate>
  );
}
