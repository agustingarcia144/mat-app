"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { FileText, Calendar, GripVertical, MoreVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatDate } from "date-fns";
import DuplicatePlanificationDialog from "../dialogs/duplicate-planification-dialog";
import DeletePlanificationDialog from "../dialogs/delete-planification-dialog";
import AssignDialog from "../assignments/assign-dialog";
import AssignedMembersDialog from "../assignments/assigned-members-dialog";
import { getPlanificationDragId } from "../planification-folder-dnd";
import type { PlanificationData } from "./planification-list";
import { cn } from "@/lib/utils";

interface PlanificationListTableProps {
  planifications: PlanificationData[];
  isLoading: boolean;
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
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignedMembersDialogOpen, setAssignedMembersDialogOpen] =
    useState(false);

  const assignments = useQuery(
    api.planificationAssignments.getByPlanification,
    {
      planificationId: planification._id as any,
    },
  );

  const dragId = getPlanificationDragId(planification._id);
  const { ref, handleRef, isDragging } = useDraggable(
    planification.isTemplate
      ? { id: `noop-plan-${planification._id}` }
      : { id: dragId },
  );

  return (
    <>
      <TableRow
        ref={
          planification.isTemplate
            ? undefined
            : (ref as (el: HTMLTableRowElement | null) => void)
        }
        className={cn("cursor-pointer", isDragging && "opacity-50")}
        onClick={() =>
          router.push(`/dashboard/planifications/${planification._id}`)
        }
      >
        <TableCell
          className="w-8 p-1 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          ref={
            planification.isTemplate
              ? undefined
              : (handleRef as (el: HTMLTableCellElement | null) => void)
          }
        >
          {!planification.isTemplate && (
            <span className="cursor-grab active:cursor-grabbing touch-none inline-block">
              <GripVertical className="h-4 w-4" />
            </span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium truncate">{planification.name}</p>
              {planification.description && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {planification.description}
                </p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(planification.createdAt, "dd/MM/yyyy")}
          </span>
        </TableCell>
        <TableCell>
          {planification.isTemplate ? (
            <Badge variant="secondary" className="text-xs">
              Plantilla
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>
        <TableCell
          className="w-[50px] pr-2"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/dashboard/planifications/${planification._id}`);
                }}
              >
                Ver
              </DropdownMenuItem>
              {!planification.isTemplate && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignedMembersDialogOpen(true);
                    }}
                  >
                    Ver Asignados
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignDialogOpen(true);
                    }}
                  >
                    Asignar
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/planifications/${planification._id}/edit`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setDuplicateDialogOpen(true);
                }}
              >
                Duplicar
              </DropdownMenuItem>
              {planification.isTemplate && onUseTemplate && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onUseTemplate(planification);
                  }}
                >
                  Usar Plantilla
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
                className="text-destructive"
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <DuplicatePlanificationDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        planification={planification}
      />

      <DeletePlanificationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planification={planification}
      />
      {!planification.isTemplate && (
        <>
          <AssignDialog
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            planificationId={planification._id}
          />
          <AssignedMembersDialog
            open={assignedMembersDialogOpen}
            onOpenChange={setAssignedMembersDialogOpen}
            assignments={assignments || []}
            planificationName={planification.name}
          />
        </>
      )}
    </>
  );
}

function PlanificationTableSkeleton() {
  return (
    <TableRow>
      <TableCell className="w-8" />
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-8" />
      </TableCell>
    </TableRow>
  );
}

export default function PlanificationListTable({
  planifications,
  isLoading,
  onUseTemplate,
}: PlanificationListTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha de creación</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <PlanificationTableSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (planifications.length === 0) {
    return (
      <Empty className="h-full w-full rounded-md border">
        <EmptyHeader>
          <EmptyMedia>
            <Image
              src={matWolfLooking}
              alt=""
              className="h-20 w-20 object-contain"
            />
          </EmptyMedia>
          <EmptyTitle>No hay planificaciones</EmptyTitle>
          <EmptyDescription>
            Crea tu primera planificación para comenzar
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Fecha de creación</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {planifications.map((planification) => (
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
