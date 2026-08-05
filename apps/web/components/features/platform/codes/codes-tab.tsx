"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import DataTableSkeleton from "@/components/ui/data-table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import CreateCodeDialog from "@/components/features/platform/codes/create-code-dialog";
import { getCodeColumns } from "@/components/features/platform/codes/codes-columns";
import {
  BILLING_ACCESS_VARIANTS,
  CODE_STATUS_LABELS,
  CODE_STATUS_ORDER,
  CODE_STATUS_VARIANTS,
  formatDay,
  getBillingAccessLabel,
  type PlatformCodeRow,
} from "@/components/features/platform/platform-labels";

const ALL = "all";

export default function CodesTab() {
  const isMobile = useIsMobile();
  const codes = useQuery(api.orgCreationCodes.listOrgCreationCodes, {});
  const revokeCode = useMutation(api.orgCreationCodes.revokeOrgCreationCode);

  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [revokeTarget, setRevokeTarget] = useState<PlatformCodeRow | null>(
    null,
  );
  const [isRevoking, setIsRevoking] = useState(false);

  const columns = useMemo(
    () => getCodeColumns({ onRevoke: setRevokeTarget }),
    [],
  );

  const filtered = useMemo(
    () =>
      (codes ?? []).filter(
        (code) => statusFilter === ALL || code.status === statusFilter,
      ),
    [codes, statusFilter],
  );

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await revokeCode({ codeId: revokeTarget.codeId });
      toast.success("Código revocado");
      setRevokeTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo revocar el código",
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Códigos de alta para clientes que no pagan por Mercado Pago. El valor
          del código solo se muestra al crearlo.
        </p>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {CODE_STATUS_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {CODE_STATUS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Crear código
          </Button>
        </div>
      </div>

      {codes === undefined ? (
        <DataTableSkeleton columns={7} rows={6} />
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
              No hay códigos.
            </div>
          ) : (
            filtered.map((code) => (
              <div key={code.codeId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {code.label ?? "Sin etiqueta"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {code.usedCount}/{code.maxUses} usos · creado{" "}
                      {formatDay(code.createdAt)}
                    </p>
                  </div>
                  {code.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setRevokeTarget(code)}
                    >
                      Revocar
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={CODE_STATUS_VARIANTS[code.status]}>
                    {CODE_STATUS_LABELS[code.status]}
                  </Badge>
                  <Badge
                    variant={
                      BILLING_ACCESS_VARIANTS[code.billingAccess ?? "legacy"]
                    }
                  >
                    {getBillingAccessLabel(code.billingAccess)}
                  </Badge>
                </div>
                {code.consumedOrganizationName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Usado por {code.consumedOrganizationName}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <CreateCodeDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar el código?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.label ?? "Este código"} deja de poder canjearse. No
              se puede deshacer: hay que crear uno nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              onClick={(event) => {
                event.preventDefault();
                void confirmRevoke();
              }}
            >
              {isRevoking ? "Revocando..." : "Revocar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
