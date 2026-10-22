"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Edit,
  Eye,
  FileStack,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import DuplicatePlanificationDialog from "../dialogs/duplicate-planification-dialog";
import DeletePlanificationDialog from "../dialogs/delete-planification-dialog";
import AssignDialog from "../assignments/assign-dialog";
import AssignedMembersDialog from "../assignments/assigned-members-dialog";
import {
  getAssignmentPhase,
  getUserInitials,
  isEndingSoon,
  useNow,
} from "../assignments/assignment-timing";
import type { PlanificationData } from "./planification-list";

export type PlanificationAssignment = {
  _id: string;
  status: string;
  startDate?: number | null;
  endDate?: number | null;
  user?: { fullName?: string; email?: string; imageUrl?: string } | null;
};

/**
 * "⋯" menu plus the dialogs it opens. Shared by the grid card and the table
 * row so both offer the same actions.
 */
export function PlanificationActions({
  planification,
  assignments,
  onUseTemplate,
  className,
}: {
  planification: PlanificationData;
  assignments: PlanificationAssignment[];
  onUseTemplate?: (template: PlanificationData) => void;
  className?: string;
}) {
  const router = useRouter();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);
  const href = `/dashboard/planifications/${planification._id}`;

  return (
    // Keep clicks inside the menu from opening the row/card underneath.
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Acciones para ${planification.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(href)}>
            <Eye className="mr-2 size-4" />
            Ver
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${href}/edit`}>
              <Edit className="mr-2 size-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          {!planification.isTemplate && (
            <>
              <DropdownMenuItem onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 size-4" />
                Asignar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssignedOpen(true)}>
                <Users className="mr-2 size-4" />
                Ver asignados
              </DropdownMenuItem>
            </>
          )}
          {planification.isTemplate && onUseTemplate && (
            <DropdownMenuItem onClick={() => onUseTemplate(planification)}>
              <FileStack className="mr-2 size-4" />
              Usar plantilla
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
            <Copy className="mr-2 size-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DuplicatePlanificationDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        planification={planification}
      />
      <DeletePlanificationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        planification={planification}
      />
      {!planification.isTemplate && (
        <>
          <AssignDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            planificationId={planification._id}
          />
          <AssignedMembersDialog
            open={assignedOpen}
            onOpenChange={setAssignedOpen}
            assignments={assignments as any}
            planificationName={planification.name}
            onAssign={() => {
              setAssignedOpen(false);
              setAssignOpen(true);
            }}
          />
        </>
      )}
    </div>
  );
}

/** Avatar stack + "3 en curso" line describing who is on the plan right now. */
export function AssignmentSummary({
  assignments,
  className,
}: {
  assignments: PlanificationAssignment[] | undefined;
  className?: string;
}) {
  const now = useNow();

  if (assignments === undefined) {
    return (
      <span
        className={cn("h-6 w-20 animate-pulse rounded bg-muted", className)}
      />
    );
  }

  const current = assignments.filter(
    (a) => getAssignmentPhase(a, now) === "current",
  );
  const endingSoon = current.filter((a) => isEndingSoon(a, now)).length;
  const upcoming = assignments.filter(
    (a) => getAssignmentPhase(a, now) === "upcoming",
  ).length;

  if (assignments.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Sin asignar
      </span>
    );
  }

  const shown = (current.length > 0 ? current : assignments).slice(0, 3);
  const rest =
    (current.length > 0 ? current.length : assignments.length) - shown.length;

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <AvatarGroup className="shrink-0">
        {shown.map((a) => (
          <Avatar key={a._id} className="size-6">
            {a.user?.imageUrl && <AvatarImage src={a.user.imageUrl} alt="" />}
            <AvatarFallback className="text-[9px]">
              {getUserInitials(a.user)}
            </AvatarFallback>
          </Avatar>
        ))}
        {rest > 0 && (
          <AvatarGroupCount className="size-6 text-[9px]">
            +{rest}
          </AvatarGroupCount>
        )}
      </AvatarGroup>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {current.length > 0 ? (
          <>
            <span className="text-foreground">{current.length} en curso</span>
            {endingSoon > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                · {endingSoon} por vencer
              </span>
            )}
          </>
        ) : upcoming > 0 ? (
          `${upcoming} programada${upcoming === 1 ? "" : "s"}`
        ) : (
          "Finalizadas"
        )}
      </span>
    </span>
  );
}
