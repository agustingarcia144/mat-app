"use client";

import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import { getPlanificationDragId } from "../planification-folder-dnd";
import {
  AssignmentSummary,
  PlanificationActions,
} from "./planification-actions";
import { cn } from "@/lib/utils";

export interface PlanificationData {
  _id: string;
  name: string;
  description?: string;
  isTemplate: boolean;
  hasEverBeenAssigned?: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

interface PlanificationListProps {
  planifications: PlanificationData[];
  isLoading: boolean;
  /** A search is active, so an empty list means "no matches". */
  isFiltered?: boolean;
  onCreate?: () => void;
  onUseTemplate?: (template: PlanificationData) => void;
}

export function PlanificationListEmpty({
  isFiltered,
  onCreate,
}: {
  isFiltered?: boolean;
  onCreate?: () => void;
}) {
  return (
    <Empty className="h-full w-full rounded-xl border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia>
          <Image
            src={matWolfLooking}
            alt=""
            className="h-16 w-16 object-contain"
          />
        </EmptyMedia>
        <EmptyTitle>
          {isFiltered ? "Sin resultados" : "Todavía no hay planificaciones"}
        </EmptyTitle>
        <EmptyDescription>
          {isFiltered
            ? "Probá con otro nombre o buscá en otra carpeta."
            : "Creá una planificación o arrancá desde una plantilla."}
        </EmptyDescription>
      </EmptyHeader>
      {!isFiltered && onCreate && (
        <Button size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          Nueva planificación
        </Button>
      )}
    </Empty>
  );
}

function PlanificationCard({
  planification,
  onUseTemplate,
}: {
  planification: PlanificationData;
  onUseTemplate?: (template: PlanificationData) => void;
}) {
  const router = useRouter();
  const assignments = useQuery(
    api.planificationAssignments.getByPlanification,
    { planificationId: planification._id as any },
  );

  const dragId = getPlanificationDragId(planification._id);
  const { ref, isDragging } = useDraggable(
    planification.isTemplate
      ? { id: `noop-plan-${planification._id}` }
      : { id: dragId },
  );

  return (
    <div
      ref={
        planification.isTemplate
          ? undefined
          : (ref as (el: HTMLDivElement | null) => void)
      }
      className={cn(
        "group flex min-h-[132px] cursor-pointer flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/30",
        !planification.isTemplate && "touch-none",
        isDragging && "opacity-50",
      )}
      onClick={() =>
        router.push(`/dashboard/planifications/${planification._id}`)
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-medium leading-snug">
            {planification.name}
          </h3>
          {planification.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {planification.description}
            </p>
          )}
        </div>
        <PlanificationActions
          planification={planification}
          assignments={assignments ?? []}
          onUseTemplate={onUseTemplate}
          className="-mr-2 -mt-1 shrink-0"
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {planification.isTemplate ? (
          <Badge variant="secondary" className="text-xs">
            Plantilla
          </Badge>
        ) : (
          <AssignmentSummary assignments={assignments} />
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {format(planification.createdAt, "d MMM yyyy", { locale: es })}
        </span>
      </div>
    </div>
  );
}

export default function PlanificationList({
  planifications,
  isLoading,
  isFiltered,
  onCreate,
  onUseTemplate,
}: PlanificationListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (planifications.length === 0) {
    return (
      <PlanificationListEmpty isFiltered={isFiltered} onCreate={onCreate} />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {planifications.map((planification) => (
        <PlanificationCard
          key={planification._id}
          planification={planification}
          onUseTemplate={onUseTemplate}
        />
      ))}
    </div>
  );
}
