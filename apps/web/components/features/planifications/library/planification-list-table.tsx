"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPlanificationDragId } from "../planification-folder-dnd";
import {
  PlanificationListEmpty,
  type PlanificationData,
} from "./planification-list";
import {
  AssignmentSummary,
  PlanificationActions,
} from "./planification-actions";
import { cn } from "@/lib/utils";

interface PlanificationListTableProps {
  planifications: PlanificationData[];
  isLoading: boolean;
  isFiltered?: boolean;
  onCreate?: () => void;
  onUseTemplate?: (template: PlanificationData) => void;
}

function PlanificationTableRow({
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
  const { ref, handleRef, isDragging } = useDraggable(
    planification.isTemplate
      ? { id: `noop-plan-${planification._id}` }
      : { id: dragId },
  );

  return (
    <TableRow
      ref={
        planification.isTemplate
          ? undefined
          : (ref as (el: HTMLTableRowElement | null) => void)
      }
      className={cn("group cursor-pointer", isDragging && "opacity-50")}
      onClick={() =>
        router.push(`/dashboard/planifications/${planification._id}`)
      }
    >
      <TableCell
        className="w-6 p-0 pl-2 text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        ref={
          planification.isTemplate
            ? undefined
            : (handleRef as (el: HTMLTableCellElement | null) => void)
        }
      >
        {!planification.isTemplate && (
          <span
            className="inline-block cursor-grab touch-none opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
            aria-label="Arrastrar a una carpeta"
          >
            <GripVertical className="size-4" />
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-0 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{planification.name}</p>
          {planification.isTemplate && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Plantilla
            </Badge>
          )}
        </div>
        {planification.description && (
          <p className="truncate text-xs text-muted-foreground">
            {planification.description}
          </p>
        )}
      </TableCell>
      <TableCell className="hidden w-[220px] lg:table-cell">
        {planification.isTemplate ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <AssignmentSummary assignments={assignments} />
        )}
      </TableCell>
      <TableCell className="hidden w-[120px] whitespace-nowrap text-sm tabular-nums text-muted-foreground md:table-cell">
        {format(planification.createdAt, "d MMM yyyy", { locale: es })}
      </TableCell>
      <TableCell className="w-[52px] pr-2">
        <PlanificationActions
          planification={planification}
          assignments={assignments ?? []}
          onUseTemplate={onUseTemplate}
        />
      </TableCell>
    </TableRow>
  );
}

function TableHeadRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-6 p-0" />
      <TableHead className="text-xs">Nombre</TableHead>
      <TableHead className="hidden w-[220px] text-xs lg:table-cell">
        Asignados
      </TableHead>
      <TableHead className="hidden w-[120px] text-xs md:table-cell">
        Creada
      </TableHead>
      <TableHead className="w-[52px]" />
    </TableRow>
  );
}

export default function PlanificationListTable({
  planifications,
  isLoading,
  isFiltered,
  onCreate,
  onUseTemplate,
}: PlanificationListTableProps) {
  if (!isLoading && planifications.length === 0) {
    return (
      <PlanificationListEmpty isFiltered={isFiltered} onCreate={onCreate} />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableHeadRow />
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell />
                  <TableCell>
                    <Skeleton className="mb-1 h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Skeleton className="h-6 w-28" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))
            : planifications.map((planification) => (
                <PlanificationTableRow
                  key={planification._id}
                  planification={planification}
                  onUseTemplate={onUseTemplate}
                />
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
