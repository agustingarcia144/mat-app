"use client";

import { useEffect } from "react";
import { usePlanificationForm } from "@/contexts/planification-form-context";
import WorkoutWeeksSection from "./workout-weeks-section";

export default function PlanificationEditForm() {
  const { form, onSubmit, setRedirectAfterSave } = usePlanificationForm();

  useEffect(() => {
    setRedirectAfterSave("view");
    return () => {
      setRedirectAfterSave("view");
    };
  }, [setRedirectAfterSave]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <WorkoutWeeksSection
        form={form as React.ComponentProps<typeof WorkoutWeeksSection>["form"]}
      />
    </form>
  );
}
