"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Edit, Gift, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Chip,
  FinanceStatePanel,
  TableShell,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/features/finance/finance-display";
import BonificationEditDialog, {
  type BonificationForEdit,
} from "./dialogs/bonification-edit-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  friend_and_family: "Familiar/Amigo",
  trainer: "Entrenador",
  employee: "Empleado",
  sponsor: "Sponsor",
  other: "Otro",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDiscount(discountType: string, discountValue: number): string {
  if (discountType === "full") return "100% gratis";
  if (discountType === "percentage") return `${discountValue}%`;
  return `$${discountValue.toLocaleString("es-AR")}`;
}

export default function BonificationList() {
  const canQuery = useCanQueryCurrentOrganization();
  const bonifications = useQuery(
    api.planBonifications.getByOrganization,
    canQuery ? { status: "active" } : "skip",
  );

  const revokeBonification = useMutation(api.planBonifications.revoke);

  const [editing, setEditing] = useState<BonificationForEdit | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [revoking, setRevoking] = useState<{
    id: BonificationForEdit["_id"];
    name: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async () => {
    if (!revoking) return;
    setIsRevoking(true);
    try {
      await revokeBonification({ bonificationId: revoking.id });
      toast.success("Bonificación revocada");
      setRevoking(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al revocar bonificación",
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Miembros bonificados</h2>
        <p className="text-sm text-muted-foreground">
          Miembros que tienen una bonificación activa en su plan.
        </p>
      </div>

      {bonifications === undefined ? (
        <FinanceStatePanel
          icon={Loader2}
          iconClassName="animate-spin"
          title="Cargando bonificaciones..."
        />
      ) : bonifications.length === 0 ? (
        <FinanceStatePanel
          icon={Gift}
          title="Sin bonificaciones activas"
          description="Los miembros con un descuento activo en su plan aparecerán acá."
        />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                <TableHead className={tableHeadClassName}>Miembro</TableHead>
                <TableHead className={tableHeadClassName}>Plan</TableHead>
                <TableHead className={tableHeadClassName}>Descuento</TableHead>
                <TableHead className={cn(tableHeadClassName, "text-right")}>
                  Monto final
                </TableHead>
                <TableHead
                  className={cn(tableHeadClassName, "hidden md:table-cell")}
                >
                  Motivo
                </TableHead>
                <TableHead
                  className={cn(tableHeadClassName, "hidden lg:table-cell")}
                >
                  Desde
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonifications.map((bonification) => {
                const discountLabel = formatDiscount(
                  bonification.discountType,
                  bonification.discountValue,
                );

                return (
                  <TableRow key={bonification._id} className={tableRowClassName}>
                    <TableCell className="font-medium">
                      {bonification.userFullName}
                    </TableCell>
                    <TableCell>
                      <p>{bonification.planName}</p>
                      <p className="text-xs text-muted-foreground">
                        ${bonification.planPriceArs.toLocaleString("es-AR")}/mes
                      </p>
                    </TableCell>
                    <TableCell>
                      <Chip className="border-purple-500/25 bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Gift className="size-3" />
                        {discountLabel}
                      </Chip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      ${bonification.effectiveAmountArs.toLocaleString("es-AR")}
                      <span className="text-xs font-normal text-muted-foreground">
                        /mes
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {REASON_LABELS[bonification.reason] ??
                        bonification.reason}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {formatDate(bonification.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing({
                                _id: bonification._id,
                                userFullName: bonification.userFullName,
                                planName: bonification.planName,
                                planPriceArs: bonification.planPriceArs,
                                discountType: bonification.discountType,
                                discountValue: bonification.discountValue,
                                reason: bonification.reason,
                                notes: bonification.notes,
                              });
                              setEditOpen(true);
                            }}
                          >
                            <Edit className="mr-2 size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setRevoking({
                                id: bonification._id,
                                name: bonification.userFullName,
                              })
                            }
                          >
                            <Trash2 className="mr-2 size-4" />
                            Revocar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <BonificationEditDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
        bonification={editing}
      />

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open && !isRevoking) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar bonificación</AlertDialogTitle>
            <AlertDialogDescription>
              La bonificación de {revoking?.name} se dará de baja y el miembro
              volverá al flujo de pago normal a partir del próximo período.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleRevoke();
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
