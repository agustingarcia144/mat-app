"use client";

import Image from "next/image";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  CalendarDays,
  Edit,
  Users,
  Copy,
  Trash2,
  MoreHorizontal,
  FileStack,
  List,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import DuplicatePlanificationDialog from "@/components/features/planifications/dialogs/duplicate-planification-dialog";
import DeletePlanificationDialog from "@/components/features/planifications/dialogs/delete-planification-dialog";
import AssignDialog from "@/components/features/planifications/assignments/assign-dialog";
import AssignedMembersDialog from "@/components/features/planifications/assignments/assigned-members-dialog";
import {
  ASSIGNMENT_PHASE_LABEL,
  ENDING_SOON_DAYS,
  getAssignmentPhase,
  getUserInitials,
  isEndingSoon,
  useNow,
  type AssignmentPhase,
} from "@/components/features/planifications/assignments/assignment-timing";
import WorkoutWeekCard from "@/components/features/planifications/cards/workout-week-card";
import WorkoutWeekHorizontalView from "@/components/features/planifications/cards/workout-week-horizontal-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Doc } from "@/convex/_generated/dataModel";

type ViewMode = "vertical" | "horizontal";

type AssignmentWithUser = Doc<"planificationAssignments"> & {
  user?: { fullName?: string; email?: string; imageUrl?: string } | null;
};

type AssignmentFilter = "all" | AssignmentPhase;

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function SummaryTile({
  label,
  value,
  dotClassName,
  onClick,
}: {
  label: string;
  value: number;
  dotClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dotClassName ? (
          <span
            className={cn("size-1.5 rounded-full", dotClassName)}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          value === 0 && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </button>
  );
}

export default function PlanificationViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignedMembersDialogOpen, setAssignedMembersDialogOpen] =
    useState(false);
  const [assignedFilter, setAssignedFilter] = useState<AssignmentFilter>("all");
  // Bumped on every open so the dialog remounts on the requested tab.
  const [assignedDialogKey, setAssignedDialogKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("vertical");
  const now = useNow();
  const isMobile = useIsMobile();
  // The week grid is seven stacked columns on a phone; the list reads better.
  const effectiveViewMode: ViewMode = isMobile ? "vertical" : viewMode;

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  });
  const workoutWeeks = useQuery(api.workoutWeeks.getByPlanification, {
    planificationId: id as any,
  });
  const workoutDays = useQuery(api.workoutDays.getByPlanification, {
    planificationId: id as any,
  });
  const assignments = useQuery(
    api.planificationAssignments.getByPlanification,
    {
      planificationId: id as any,
    },
  );

  const openAssigned = (filter: AssignmentFilter = "all") => {
    setAssignedFilter(filter);
    setAssignedDialogKey((key) => key + 1);
    setAssignedMembersDialogOpen(true);
  };

  const openAssign = () => {
    setAssignedMembersDialogOpen(false);
    setAssignDialogOpen(true);
  };

  if (
    planification === undefined ||
    workoutWeeks === undefined ||
    assignments === undefined
  ) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </DashboardPageContainer>
    );
  }

  if (!planification) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <Empty className="rounded-xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-20 w-20 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>Planificación no encontrada</EmptyTitle>
            <EmptyDescription>
              Puede que se haya eliminado o que el link sea incorrecto.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/planifications">
              Volver a planificaciones
            </Link>
          </Button>
        </Empty>
      </DashboardPageContainer>
    );
  }

  const isTemplate = planification.isTemplate;
  const phaseCounts = { current: 0, upcoming: 0, finished: 0 };
  let endingSoonCount = 0;
  for (const assignment of assignments as AssignmentWithUser[]) {
    phaseCounts[getAssignmentPhase(assignment, now)]++;
    if (isEndingSoon(assignment, now)) endingSoonCount++;
  }

  // Lead the avatar stack with the people currently on the plan.
  const stackAssignments = [...(assignments as AssignmentWithUser[])].sort(
    (a, b) =>
      Number(getAssignmentPhase(a, now) !== "current") -
      Number(getAssignmentPhase(b, now) !== "current"),
  );

  const meta = [
    `Creada el ${format(planification.createdAt, "d MMM yyyy", { locale: es })}`,
    plural(workoutWeeks.length, "semana", "semanas"),
    workoutDays !== undefined
      ? plural(workoutDays.length, "día", "días")
      : null,
  ].filter(Boolean);

  const assignedStack =
    !isTemplate && assignments.length > 0 ? (
      <button
        type="button"
        onClick={() => openAssigned()}
        className="-ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring md:ml-0 md:mr-1"
        aria-label="Ver miembros asignados"
      >
        <AvatarGroup>
          {stackAssignments.slice(0, 3).map((assignment) => (
            <Avatar key={assignment._id} className="size-7">
              {assignment.user?.imageUrl && (
                <AvatarImage src={assignment.user.imageUrl} alt="" />
              )}
              <AvatarFallback className="text-[10px]">
                {getUserInitials(assignment.user)}
              </AvatarFallback>
            </Avatar>
          ))}
          {assignments.length > 3 && (
            <AvatarGroupCount className="size-7 text-[10px]">
              +{assignments.length - 3}
            </AvatarGroupCount>
          )}
        </AvatarGroup>
        <span className="text-sm text-muted-foreground md:hidden lg:inline">
          {plural(assignments.length, "asignado", "asignados")}
        </span>
      </button>
    ) : null;

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Más acciones">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isTemplate && (
          <DropdownMenuItem onClick={() => openAssigned()}>
            <Users className="mr-2 size-4" />
            Ver asignados
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setDuplicateDialogOpen(true)}>
          <Copy className="mr-2 size-4" />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setDeleteDialogOpen(true)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 gap-1.5 text-muted-foreground"
        asChild
      >
        <Link href="/dashboard/planifications">
          <ArrowLeft className="size-4" aria-hidden />
          Planificaciones
        </Link>
      </Button>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold md:text-3xl">
                {planification.name}
              </h1>
              {isTemplate && <Badge variant="secondary">Plantilla</Badge>}
            </div>
            {/* Mobile keeps the overflow menu beside the title. */}
            <div className="shrink-0 md:hidden">{moreMenu}</div>
          </div>
          <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>
          {planification.description && (
            <p className="max-w-2xl pt-1 text-sm text-muted-foreground md:text-base">
              {planification.description}
            </p>
          )}
          {assignedStack && (
            <div className="pt-2 md:hidden">{assignedStack}</div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 md:flex md:items-center">
          {assignedStack && (
            <div className="hidden md:block">{assignedStack}</div>
          )}
          {isTemplate ? (
            <Button
              className="gap-1.5"
              onClick={() =>
                router.push(
                  `/dashboard/planifications?createFrom=${planification._id}`,
                )
              }
            >
              <FileStack className="size-4" aria-hidden />
              Usar plantilla
            </Button>
          ) : (
            <Button className="gap-1.5" onClick={openAssign}>
              <UserPlus className="size-4" aria-hidden />
              Asignar
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" asChild>
            <Link href={`/dashboard/planifications/${id}/edit`}>
              <Edit className="size-4" aria-hidden />
              Editar
            </Link>
          </Button>
          <div className="hidden md:block">{moreMenu}</div>
        </div>
      </div>

      {!isTemplate && assignments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile
            label={ASSIGNMENT_PHASE_LABEL.current}
            value={phaseCounts.current}
            dotClassName="bg-emerald-500"
            onClick={() => openAssigned("current")}
          />
          <SummaryTile
            label={`Terminan en ${ENDING_SOON_DAYS} días`}
            value={endingSoonCount}
            dotClassName="bg-amber-500"
            onClick={() => openAssigned("current")}
          />
          <SummaryTile
            label={ASSIGNMENT_PHASE_LABEL.upcoming}
            value={phaseCounts.upcoming}
            dotClassName="bg-sky-500"
            onClick={() => openAssigned("upcoming")}
          />
          <SummaryTile
            label={ASSIGNMENT_PHASE_LABEL.finished}
            value={phaseCounts.finished}
            dotClassName="bg-muted-foreground/50"
            onClick={() => openAssigned("finished")}
          />
        </div>
      )}

      <DuplicatePlanificationDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        planification={planification}
      />
      <DeletePlanificationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planification={planification}
        onSuccess={() => router.push("/dashboard/planifications")}
      />
      {!isTemplate && (
        <>
          <AssignDialog
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            planificationId={id}
          />
          <AssignedMembersDialog
            key={assignedDialogKey}
            open={assignedMembersDialogOpen}
            onOpenChange={setAssignedMembersDialogOpen}
            assignments={assignments || []}
            planificationName={planification.name}
            initialFilter={assignedFilter}
            onAssign={openAssign}
          />
        </>
      )}

      {workoutWeeks.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-20 w-20 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay semanas</EmptyTitle>
            <EmptyDescription>
              Agregá semanas y días para armar el entrenamiento.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" className="gap-1.5" asChild>
            <Link href={`/dashboard/planifications/${id}/edit`}>
              <Edit className="size-4" aria-hidden />
              Editar planificación
            </Link>
          </Button>
        </Empty>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Entrenamiento
            </h2>
            <Tabs
              className="hidden md:block"
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              <TabsList>
                <TabsTrigger value="vertical" className="gap-1.5">
                  <List className="size-4" aria-hidden />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="horizontal" className="gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  Semana
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-3 md:space-y-4">
            {effectiveViewMode === "vertical"
              ? workoutWeeks.map((week: Doc<"workoutWeeks">) => (
                  <WorkoutWeekCard key={week._id} week={week} />
                ))
              : workoutWeeks.map((week: Doc<"workoutWeeks">) => (
                  <WorkoutWeekHorizontalView key={week._id} week={week} />
                ))}
          </div>
        </section>
      )}
    </DashboardPageContainer>
  );
}
