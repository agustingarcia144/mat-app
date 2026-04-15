"use client";

import { useQuery, useMutation } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Plus, FileStack, FolderTree, Search } from "lucide-react";
import {
  useState,
  useCallback,
  useSyncExternalStore,
  useEffect,
  startTransition,
  useDeferredValue,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DragDropProvider, useDragDropMonitor } from "@dnd-kit/react";
import { toast } from "sonner";
import {
  parsePlanificationDragId,
  parseFolderDndId,
  FOLDER_ROOT_ID,
  getFolderAndDescendantIds,
} from "@/components/features/planifications/planification-folder-dnd";

const PLANIFICATIONS_LIST_VIEW_KEY = "planifications-list-view";

function getStoredListView(): "grid" | "table" {
  if (typeof window === "undefined") return "grid";
  const s = localStorage.getItem(PLANIFICATIONS_LIST_VIEW_KEY);
  return s === "grid" || s === "table" ? s : "grid";
}

const listViewListeners = new Set<() => void>();
function subscribeToListView(callback: () => void) {
  listViewListeners.add(callback);
  return () => {
    listViewListeners.delete(callback);
  };
}
function notifyListViewListeners() {
  listViewListeners.forEach((cb) => cb());
}
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import PlanificationList from "@/components/features/planifications/library/planification-list";
import PlanificationListTable from "@/components/features/planifications/library/planification-list-table";
import FolderTreeSidebar from "@/components/features/planifications/folder-tree/folder-tree";
import CreatePlanificationDialog from "@/components/features/planifications/dialogs/create-planification-dialog";
import TemplatesDialog from "@/components/features/planifications/dialogs/templates-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";

/** Must be a direct child of DragDropProvider so useDragDropMonitor receives the manager and we get the drop target. */
function PlanificationsDragEndMonitor({
  onDragEnd,
  children,
}: {
  onDragEnd: (event: unknown, manager?: unknown) => void;
  children: React.ReactNode;
}) {
  useDragDropMonitor({ onDragEnd });
  return <>{children}</>;
}

export default function PlanificationsPage() {
  const isMobile = useIsMobile();
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogTemplateId, setCreateDialogTemplateId] = useState<
    string | undefined
  >(undefined);
  const [createDialogTemplate, setCreateDialogTemplate] = useState<
    { name: string; description?: string } | undefined
  >(undefined);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [dialogFolderId, setDialogFolderId] = useState<string | undefined>();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const createFrom = searchParams.get("createFrom");
    if (createFrom) {
      startTransition(() => {
        setCreateDialogTemplateId(createFrom);
        setCreateDialogOpen(true);
      });
      router.replace("/dashboard/planifications", { scroll: false });
    }
  }, [searchParams, router]);
  const listView = useSyncExternalStore(
    subscribeToListView,
    getStoredListView,
    () => "grid",
  );
  const setListView = useCallback((value: "grid" | "table") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(PLANIFICATIONS_LIST_VIEW_KEY, value);
      notifyListViewListeners();
    }
  }, []);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);

  const folders = useQuery(
    api.folders.getTree,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const deletableFolderIds = useQuery(
    api.folders.getDeletableFolderIds,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const planifications = useQuery(
    api.planifications.getByFolder,
    canQueryCurrentOrganization
      ? {
          folderId: selectedFolderId ? (selectedFolderId as any) : undefined,
        }
      : "skip",
  );
  const updatePlanification = useMutation(api.planifications.update);
  const moveFolder = useMutation(api.folders.move);

  const handleDragEnd = useCallback(
    async (event: unknown, manager?: unknown) => {
      if ((event as { canceled?: boolean })?.canceled) return;
      const ev = event as {
        operation?: { source?: { id?: string }; target?: { id?: string } };
        detail?: {
          operation?: { source?: { id?: string }; target?: { id?: string } };
        };
      };
      const mgr = manager as
        | {
            dragOperation?: {
              source?: { id?: string };
              target?: { id?: string };
            };
            operation?: { source?: { id?: string }; target?: { id?: string } };
          }
        | undefined;
      const op =
        ev?.operation ??
        mgr?.dragOperation ??
        mgr?.operation ??
        ev?.detail?.operation;
      const source = op?.source;
      const target = op?.target;
      if (!source?.id || !target?.id || source.id === target.id) return;

      const sourceId = String(source.id);
      const targetId = String(target.id);

      const planificationId = parsePlanificationDragId(sourceId);
      if (planificationId != null) {
        if (targetId !== FOLDER_ROOT_ID && parseFolderDndId(targetId) == null)
          return;
        try {
          await updatePlanification({
            id: planificationId as any,
            folderId:
              targetId === FOLDER_ROOT_ID
                ? undefined
                : (parseFolderDndId(targetId) as any),
          });
          toast.success("Planificación movida");
        } catch {
          toast.error("Error al mover la planificación");
        }
        return;
      }

      const sourceFolderId = parseFolderDndId(sourceId);
      if (sourceFolderId != null) {
        if (targetId !== FOLDER_ROOT_ID && parseFolderDndId(targetId) == null)
          return;
        const folderList = folders ?? [];
        const invalidTargets = getFolderAndDescendantIds(
          sourceFolderId,
          folderList,
        );
        const targetFolderId =
          targetId === FOLDER_ROOT_ID ? null : parseFolderDndId(targetId);
        if (targetFolderId != null && invalidTargets.has(targetFolderId))
          return;
        try {
          await moveFolder({
            id: sourceFolderId as any,
            newParentId:
              targetId === FOLDER_ROOT_ID ? undefined : (targetFolderId as any),
          });
          toast.success("Carpeta movida");
        } catch {
          toast.error("Error al mover la carpeta");
        }
      }
    },
    [folders, updatePlanification, moveFolder],
  );

  const selectedFolderName = selectedFolderId
    ? folders?.find((folder: Doc<"folders">) => folder._id === selectedFolderId)
        ?.name
    : "Todas";

  const handleUseTemplate = useCallback(
    (template: { _id: string; name: string; description?: string }) => {
      setCreateDialogTemplateId(template._id);
      setCreateDialogTemplate({
        name: template.name,
        description: template.description,
      });
      setCreateDialogOpen(true);
      setTemplatesDialogOpen(false);
    },
    [],
  );

  const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
  const filteredPlanifications = (planifications || []).filter((planification) => {
    if (!normalizedSearch) return true;

    return `${planification.name} ${planification.description ?? ""}`
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const searchInput = (
    <div className="relative w-full md:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Buscar planificaciones..."
        className="h-10 pl-10"
        aria-label="Buscar planificaciones"
      />
    </div>
  );

  const planificationsGrid = (
    <PlanificationList
      planifications={filteredPlanifications}
      isLoading={planifications === undefined}
      onUseTemplate={handleUseTemplate}
    />
  );

  const desktopListContent =
    listView === "grid" ? (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 min-h-0 p-4 pt-2 overflow-auto">
            {planificationsGrid}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setDialogFolderId(selectedFolderId || undefined);
              setCreateDialogOpen(true);
            }}
          >
            Nueva Planificación
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ) : (
      <div className="flex-1 min-h-0 p-4 pt-2 overflow-auto">
        <PlanificationListTable
          planifications={filteredPlanifications}
          isLoading={planifications === undefined}
          onUseTemplate={handleUseTemplate}
        />
      </div>
    );

  const dialogs = (
    <>
      <CreatePlanificationDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setDialogFolderId(undefined);
            setCreateDialogTemplateId(undefined);
            setCreateDialogTemplate(undefined);
          }
        }}
        folderId={dialogFolderId}
        templateId={createDialogTemplateId}
        initialTemplate={createDialogTemplate}
      />

      <TemplatesDialog
        open={templatesDialogOpen}
        onOpenChange={setTemplatesDialogOpen}
        onUseTemplate={handleUseTemplate}
      />
    </>
  );

  if (isMobile) {
    return (
      <DashboardPageContainer className="space-y-4 py-4 md:py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Planificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona programas de entrenamiento
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ResponsiveActionButton
            variant="outline"
            onClick={() => setTemplatesDialogOpen(true)}
            icon={<FileStack className="h-4 w-4" aria-hidden />}
            label="Ver Plantillas"
            tooltip="Ver Plantillas"
          />
          <ResponsiveActionButton
            onClick={() => {
              setDialogFolderId(undefined);
              setCreateDialogOpen(true);
            }}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            label="Nueva planificación"
            tooltip="Nueva planificación"
          />
          <Sheet open={mobileFoldersOpen} onOpenChange={setMobileFoldersOpen}>
            <SheetTrigger asChild>
              <ResponsiveActionButton
                variant="outline"
                icon={<FolderTree className="h-4 w-4" aria-hidden />}
                label="Carpetas"
                tooltip="Seleccionar carpeta"
              />
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Carpetas</SheetTitle>
              </SheetHeader>
              <div className="mt-4 overflow-y-auto">
                <FolderTreeSidebar
                  folders={folders || []}
                  selectedId={selectedFolderId}
                  onSelect={(id) => {
                    setSelectedFolderId(id);
                    setMobileFoldersOpen(false);
                  }}
                  deletableFolderIds={deletableFolderIds ?? []}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="pt-1">{searchInput}</div>

        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Carpeta activa</p>
          <p className="truncate text-sm font-medium">{selectedFolderName}</p>
        </div>

        <div className="rounded-lg border p-3">{planificationsGrid}</div>

        {dialogs}
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Planificaciones</h1>
          <p className="mt-1 text-muted-foreground">
            Gestiona programas de entrenamiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResponsiveActionButton
            variant="outline"
            onClick={() => setTemplatesDialogOpen(true)}
            icon={<FileStack className="h-4 w-4" aria-hidden />}
            label="Ver Plantillas"
            tooltip="Ver Plantillas"
          />
          <ResponsiveActionButton
            onClick={() => {
              setDialogFolderId(undefined);
              setCreateDialogOpen(true);
            }}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            label="Nueva planificación"
            tooltip="Nueva planificación"
          />
        </div>
      </div>

      <div className="mb-4">{searchInput}</div>

      {dialogs}

      <DragDropProvider onDragEnd={handleDragEnd}>
        <PlanificationsDragEndMonitor onDragEnd={handleDragEnd}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="rounded-lg border min-h-[calc(100vh-320px)]"
          >
            <ResizablePanel defaultSize={25} className="p-4 bg-card">
              <FolderTreeSidebar
                folders={folders || []}
                selectedId={selectedFolderId}
                onSelect={setSelectedFolderId}
                deletableFolderIds={deletableFolderIds ?? []}
                enableDnd
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={75} className="relative">
              <div className="absolute inset-0 flex flex-col">
                <div className="shrink-0 flex justify-end p-4 pb-2 items-center gap-2">
                  <span className="text-sm text-muted-foreground">Vista:</span>
                  <Select
                    value={listView}
                    onValueChange={(v) => setListView(v as "grid" | "table")}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Vista" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grid">Cuadrícula</SelectItem>
                      <SelectItem value="table">Tabla</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {desktopListContent}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </PlanificationsDragEndMonitor>
      </DragDropProvider>
    </DashboardPageContainer>
  );
}
