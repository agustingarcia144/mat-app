"use client";

import { useQuery, useMutation } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  ChevronDown,
  FileStack,
  Folder,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { FeatureDisabledPage } from "@/components/shared/feature-disabled-page";
import {
  useState,
  useCallback,
  useSyncExternalStore,
  useEffect,
  startTransition,
  useDeferredValue,
} from "react";
import type { ComponentType, ReactNode } from "react";
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

type SortOrder = "recent" | "oldest" | "name";

const SORT_LABEL: Record<SortOrder, string> = {
  recent: "Más recientes",
  oldest: "Más antiguas",
  name: "Nombre A–Z",
};
const TypedDragDropProvider = DragDropProvider as ComponentType<{
  children?: ReactNode;
}>;

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
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const orgSettings = useOrgSettings();
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
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");

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
  const filteredPlanifications = (planifications || [])
    .filter((planification) => {
      if (!normalizedSearch) return true;

      return `${planification.name} ${planification.description ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .sort((a, b) =>
      sortOrder === "name"
        ? a.name.localeCompare(b.name, "es")
        : sortOrder === "oldest"
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
    );
  const isFiltered = normalizedSearch.length > 0;
  const openCreate = () => {
    setDialogFolderId(selectedFolderId || undefined);
    setCreateDialogOpen(true);
  };
  const countLabel =
    planifications === undefined
      ? "Cargando..."
      : `${filteredPlanifications.length} ${
          filteredPlanifications.length === 1
            ? "planificación"
            : "planificaciones"
        }`;

  if (orgSettings && !orgSettings.planificationsEnabled) {
    return <FeatureDisabledPage featureName="Planificaciones" />;
  }

  const searchInput = (
    <div className="relative w-full md:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Buscar por nombre..."
        className="h-9 pl-9"
        aria-label="Buscar planificaciones"
      />
    </div>
  );

  const sortSelect = (
    <Select
      value={sortOrder}
      onValueChange={(v) => setSortOrder(v as SortOrder)}
    >
      <SelectTrigger className="h-9 w-[150px] shrink-0" aria-label="Ordenar">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SORT_LABEL) as SortOrder[]).map((key) => (
          <SelectItem key={key} value={key}>
            {SORT_LABEL[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const headerActions = (
    <div className="flex shrink-0 items-center gap-2">
      <ResponsiveActionButton
        variant="outline"
        onClick={() => setTemplatesDialogOpen(true)}
        icon={<FileStack className="h-4 w-4" aria-hidden />}
        label="Plantillas"
        tooltip="Plantillas"
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
  );

  const planificationsGrid = (
    <PlanificationList
      planifications={filteredPlanifications}
      isLoading={planifications === undefined}
      isFiltered={isFiltered}
      onCreate={openCreate}
      onUseTemplate={handleUseTemplate}
    />
  );

  const desktopListContent =
    listView === "grid" ? (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {planificationsGrid}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={openCreate}>
            Nueva Planificación
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ) : (
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <PlanificationListTable
          planifications={filteredPlanifications}
          isLoading={planifications === undefined}
          isFiltered={isFiltered}
          onCreate={openCreate}
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
      <DashboardPageContainer className="space-y-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold">Planificaciones</h1>
            <p className="text-sm text-muted-foreground">{countLabel}</p>
          </div>
          {headerActions}
        </div>

        <div className="space-y-2">
          {searchInput}
          <div className="flex items-center gap-2">
            <Sheet open={mobileFoldersOpen} onOpenChange={setMobileFoldersOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 min-w-0 flex-1 justify-between gap-2 font-normal"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{selectedFolderName}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[80dvh] rounded-t-2xl"
              >
                <SheetHeader>
                  <SheetTitle>Carpetas</SheetTitle>
                </SheetHeader>
                <div className="mt-2 overflow-y-auto">
                  <FolderTreeSidebar
                    folders={folders || []}
                    selectedId={selectedFolderId}
                    onSelect={(id) => {
                      setSelectedFolderId(id);
                      setMobileFoldersOpen(false);
                    }}
                    deletableFolderIds={deletableFolderIds ?? []}
                    hideTitle
                  />
                </div>
              </SheetContent>
            </Sheet>
            {sortSelect}
          </div>
        </div>

        {planificationsGrid}

        {dialogs}
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="flex h-[calc(100svh-6rem)] flex-col py-6">
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Planificaciones</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Programas de entrenamiento organizados en carpetas.
          </p>
        </div>
        {headerActions}
      </div>

      {dialogs}

      <TypedDragDropProvider>
        <PlanificationsDragEndMonitor onDragEnd={handleDragEnd}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="mt-6 min-h-0 flex-1 overflow-hidden rounded-xl border"
          >
            <ResizablePanel
              defaultSize={22}
              minSize={15}
              className="overflow-y-auto bg-card p-3"
            >
              <FolderTreeSidebar
                folders={folders || []}
                selectedId={selectedFolderId}
                onSelect={setSelectedFolderId}
                deletableFolderIds={deletableFolderIds ?? []}
                enableDnd
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={78} minSize={40} className="relative">
              <div className="absolute inset-0 flex flex-col">
                <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
                  <div className="min-w-0 shrink-0">
                    <p className="truncate text-sm font-medium">
                      {selectedFolderName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {countLabel}
                    </p>
                  </div>

                  <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
                    {searchInput}
                    {sortSelect}
                    <Tabs
                      value={listView}
                      onValueChange={(v) => setListView(v as "grid" | "table")}
                    >
                      <TabsList className="h-9">
                        <TabsTrigger
                          value="grid"
                          className="px-2"
                          aria-label="Vista de tarjetas"
                        >
                          <LayoutGrid className="size-4" />
                        </TabsTrigger>
                        <TabsTrigger
                          value="table"
                          className="px-2"
                          aria-label="Vista de lista"
                        >
                          <List className="size-4" />
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
                {desktopListContent}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </PlanificationsDragEndMonitor>
      </TypedDragDropProvider>
    </DashboardPageContainer>
  );
}
