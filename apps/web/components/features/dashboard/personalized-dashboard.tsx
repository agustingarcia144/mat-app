"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  type DragDropEventHandlers,
} from "@dnd-kit/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GripVertical,
  Settings2,
} from "lucide-react";
import {
  isDashboardCardId,
  moveDashboardCard,
  normalizeDashboardLayout,
  type DashboardCardId,
  type DashboardColumn,
  type DashboardLayout,
} from "@repo/core/utils";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import DashboardHeader from "./dashboard-header";
import { useDashboardScope } from "./dashboard-scope-context";
import { PanelSkeleton } from "./dashboard-panel";

const LABELS: Record<DashboardCardId, string> = {
  pending: "Para resolver",
  classes: "Clases",
  members: "Miembros activos",
  payments: "Balance financiero",
  planifications: "Planificaciones",
};
type Props = {
  cards: Partial<Record<DashboardCardId, ReactNode>>;
  children: ReactNode;
};

export default function PersonalizedDashboard(props: Props) {
  const { organizationId, myUserId } = useDashboardScope();
  return <DashboardEditor key={`${organizationId}:${myUserId}`} {...props} />;
}

function DashboardEditor({ cards, children }: Props) {
  const { organizationId, isLoading } = useDashboardScope();
  const canQuery = useCanQueryCurrentOrganization();
  const args = organizationId
    ? { organizationId: organizationId as Id<"organizations"> }
    : null;
  const preferences = useQuery(
    api.dashboardPreferences.get,
    canQuery && args && !isLoading ? args : "skip",
  );
  const saveLayout = useMutation(
    api.dashboardPreferences.save,
  ).withOptimisticUpdate((store, { organizationId, layout }) => {
    const current = store.getQuery(api.dashboardPreferences.get, {
      organizationId,
    });
    if (current)
      store.setQuery(
        api.dashboardPreferences.get,
        { organizationId },
        { ...current, layout },
      );
  });
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const layout = draft ?? normalizeDashboardLayout(preferences?.layout);
  const editing = draft !== null;
  const enabledColumns = (["left", "right"] as const).filter(
    (column) => editing || layout[column].some((id) => Boolean(cards[id])),
  );
  const move = (
    id: DashboardCardId,
    column: DashboardColumn,
    index: number,
  ) => {
    if (!editing || saving) return;
    setDraft(moveDashboardCard(layout, id, column, index));
    setAnnouncement(
      `${LABELS[id]} movida a la columna ${column === "left" ? "izquierda" : "derecha"}.`,
    );
  };
  const onDragEnd: DragDropEventHandlers["onDragEnd"] = (event) => {
    if (event.canceled || !editing || saving) return;
    const source = event.operation.source?.id;
    const target = event.operation.target?.id;
    if (!isDashboardCardId(source) || source === target) return;
    if (target === "end:left" || target === "end:right") {
      const column = target === "end:left" ? "left" : "right";
      move(source, column, layout[column].filter((id) => id !== source).length);
    } else if (isDashboardCardId(target)) {
      const column = layout.left.includes(target) ? "left" : "right";
      move(source, column, layout[column].indexOf(target));
    }
  };
  const save = async () => {
    if (!draft || !args || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveLayout({ ...args, layout: draft });
      setDraft(null);
      setAnnouncement("Orden del inicio guardado.");
    } catch {
      setError(
        "No pudimos guardar el orden. Tu cambio sigue disponible; intentá guardar de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  };
  const controls = editing ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={saving}
        onClick={() => {
          setDraft(normalizeDashboardLayout());
          setError(null);
        }}
      >
        Restablecer
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={() => {
          setDraft(null);
          setError(null);
        }}
      >
        Cancelar
      </Button>
      <Button type="button" size="sm" disabled={saving} onClick={save}>
        {saving ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  ) : preferences?.canCustomize ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        setDraft(normalizeDashboardLayout(preferences.layout));
        setError(null);
      }}
    >
      <Settings2 aria-hidden /> Personalizar
    </Button>
  ) : null;

  return (
    <>
      <DashboardHeader action={controls} />
      {children}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && (
        <p className="text-sm text-muted-foreground">
          Arrastrá las secciones para ordenarlas o usá las flechas. Guardá para
          aplicar tus cambios.
        </p>
      )}
      {preferences === undefined ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      ) : (
        <DragDropProvider onDragEnd={onDragEnd}>
          <div
            className={cn(
              "grid items-start gap-4",
              enabledColumns.length === 2 && "lg:grid-cols-2 lg:gap-6",
            )}
          >
            {enabledColumns.map((column) => (
              <div
                key={column}
                className="min-w-0 space-y-4"
                aria-label={`Columna ${column === "left" ? "izquierda" : "derecha"}`}
              >
                {layout[column]
                  .filter((id) => Boolean(cards[id]))
                  .map((id) => (
                    <EditableCard
                      key={id}
                      id={id}
                      editing={editing}
                      disabled={saving}
                      column={column}
                      canMoveUp={
                        layout[column]
                          .filter((item) => Boolean(cards[item]))
                          .indexOf(id) > 0
                      }
                      canMoveDown={
                        layout[column]
                          .filter((item) => Boolean(cards[item]))
                          .indexOf(id) <
                        layout[column].filter((item) => Boolean(cards[item]))
                          .length -
                          1
                      }
                      onMove={(direction) => {
                        const visible = layout[column].filter((item) =>
                          Boolean(cards[item]),
                        );
                        const index = visible.indexOf(id);
                        if (direction === "other") {
                          const other = column === "left" ? "right" : "left";
                          move(id, other, layout[other].length);
                        } else {
                          const neighbor =
                            visible[index + (direction === "up" ? -1 : 1)];
                          if (neighbor)
                            move(id, column, layout[column].indexOf(neighbor));
                        }
                      }}
                    >
                      {cards[id]}
                    </EditableCard>
                  ))}
                {editing && <ColumnEnd column={column} disabled={saving} />}
              </div>
            ))}
          </div>
        </DragDropProvider>
      )}
    </>
  );
}

type EditableCardProps = {
  id: DashboardCardId;
  column: DashboardColumn;
  editing: boolean;
  disabled: boolean;
  children: ReactNode;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down" | "other") => void;
};

function EditableCard(props: EditableCardProps) {
  // A disabled draggable sets aria-disabled on its subtree, including card actions.
  // Keep the normal dashboard outside draggable elements entirely.
  return props.editing ? (
    <DraggableCard {...props} />
  ) : (
    <div className="min-w-0">{props.children}</div>
  );
}

function DraggableCard({
  id,
  column,
  editing,
  disabled,
  children,
  canMoveUp,
  canMoveDown,
  onMove,
}: EditableCardProps) {
  const {
    ref: dragRef,
    handleRef,
    isDragging,
  } = useDraggable({ id, disabled: !editing || disabled });
  const { ref: dropRef, isDropTarget } = useDroppable({
    id,
    disabled: !editing || disabled,
  });
  return (
    <div
      ref={(element) => {
        dragRef(element);
        dropRef(element);
      }}
      className={cn(
        "min-w-0 rounded-xl",
        editing && "border border-dashed p-2",
        isDragging && "opacity-40",
        isDropTarget && !isDragging && "ring-2 ring-primary",
      )}
    >
      {editing && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            ref={handleRef}
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="touch-none cursor-grab active:cursor-grabbing"
            aria-label={`Arrastrar ${LABELS[id]}`}
          >
            <GripVertical aria-hidden />{" "}
            <span className="text-xs">{LABELS[id]}</span>
          </Button>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled || !canMoveUp}
              onClick={() => onMove("up")}
              aria-label={`Subir ${LABELS[id]}`}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled || !canMoveDown}
              onClick={() => onMove("down")}
              aria-label={`Bajar ${LABELS[id]}`}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={() => onMove("other")}
              aria-label={`Mover ${LABELS[id]} a la columna ${column === "left" ? "derecha" : "izquierda"}`}
            >
              {column === "left" ? (
                <ArrowRight aria-hidden />
              ) : (
                <ArrowLeft aria-hidden />
              )}
            </Button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function ColumnEnd({
  column,
  disabled,
}: {
  column: DashboardColumn;
  disabled: boolean;
}) {
  const { ref, isDropTarget } = useDroppable({ id: `end:${column}`, disabled });
  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-20 items-center justify-center rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground",
        isDropTarget && "border-primary bg-accent text-foreground",
      )}
    >
      Soltá una sección aquí
    </div>
  );
}
