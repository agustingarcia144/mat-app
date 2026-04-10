"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { usePlanificationForm } from "@/contexts/planification-form-context";

export default function NewDayPageClient({
  planificationId,
  weekIndex,
  dayOfWeek,
}: {
  planificationId: string;
  weekIndex: number;
  dayOfWeek: number;
}) {
  const router = useRouter();
  const { form } = usePlanificationForm();
  const didAppend = useRef(false);

  const { fields, append } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  });

  useEffect(() => {
    if (didAppend.current) return;
    didAppend.current = true;

    const newIndex = fields.length;
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${newIndex + 1}`,
      dayOfWeek,
      blocks: [],
      exercises: [],
    });

    router.replace(
      `/dashboard/planifications/${planificationId}/edit/day/${weekIndex}/${newIndex}?new=1`,
    );
  }, [append, dayOfWeek, fields.length, planificationId, router, weekIndex]);

  return (
    <div className="w-full py-6 flex items-center justify-center text-muted-foreground">
      Creando día...
    </div>
  );
}
