"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import RoleBadge from "@/components/shared/badges/role-badge";
import StatusBadge from "@/components/shared/badges/status-badge";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StaffCompensationDialog from "@/components/features/team/staff-compensation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Member } from "@repo/core";
import { api } from "@/convex/_generated/api";

function UserNameCell({ member }: { member: Member }) {
  const initials =
    member.fullName
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    "?";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 shrink-0">
        {member.imageUrl && <AvatarImage src={member.imageUrl} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{member.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {member.email || "Sin email"}
        </p>
      </div>
    </div>
  );
}

function UserActionsCell({ member }: { member: Member }) {
  const { user: currentUser } = useUser();
  const removeMember = useMutation(api.organizationMemberships.removeMember);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSelf = currentUser?.id === member.id;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await removeMember({
        userId: member.id,
      });
      if (!result?.updated) {
        toast.error("No se pudo eliminar el usuario");
        return;
      }
      toast.success("Usuario eliminado del equipo");
      setConfirmOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al eliminar el usuario",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Abrir menú</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCompOpen(true)}>
            <Wallet className="h-4 w-4" />
            Editar precios
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isSelf}
            onClick={() => !isSelf && setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {isSelf ? "No puedes eliminarte" : "Eliminar del equipo"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StaffCompensationDialog
        open={compOpen}
        onOpenChange={setCompOpen}
        staff={{
          userId: member.id,
          name: member.name,
          payrollType: member.payrollType,
          pricePerHour: member.pricePerHour,
          pricePerClass: member.pricePerClass,
          pricePerMonth: member.pricePerMonth,
          commissionPercentage: member.commissionPercentage,
        }}
      />
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario del equipo</DialogTitle>
            <DialogDescription>
              {member.name} perderá el acceso a esta organización. Los datos
              históricos (asignaciones, reservas, etc.) se conservan. Esta
              acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const nameColumn: ColumnDef<Member> = {
  accessorKey: "name",
  header: "Nombre",
  cell: ({ row }) => <UserNameCell member={row.original} />,
};

export const getColumns = (): ColumnDef<Member>[] => [
  nameColumn,
  {
    accessorKey: "role",
    header: "Rol",
    cell: ({ row }) => <RoleBadge role={row.original.role ?? ""} />,
  },
  {
    id: "prices",
    header: "Precios",
    cell: ({ row }) => {
      const {
        payrollType,
        pricePerHour,
        pricePerClass,
        pricePerMonth,
        commissionPercentage,
      } = row.original;

      const money = (value: number) => `$${value.toLocaleString("es-AR")}`;
      const parts: string[] = [];
      if (payrollType === "monthly") {
        if (pricePerMonth !== undefined)
          parts.push(`${money(pricePerMonth)}/mes`);
      } else {
        if (pricePerHour !== undefined) parts.push(`${money(pricePerHour)}/h`);
        if (pricePerClass !== undefined)
          parts.push(`${money(pricePerClass)}/clase`);
      }
      if (commissionPercentage) {
        parts.push(`${commissionPercentage}% comisión`);
      }

      if (parts.length === 0) {
        return (
          <span className="text-sm text-muted-foreground">Sin cargar</span>
        );
      }
      return <div className="text-sm tabular-nums">{parts.join(" · ")}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => (
      <StatusBadge status={row.original.status?.toLowerCase() ?? "inactive"} />
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Se unió",
    cell: ({ row }) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {typeof row.original.createdAt === "string"
          ? row.original.createdAt
          : new Date(row.original.createdAt).toLocaleDateString("es-AR")}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <UserActionsCell member={row.original} />,
  },
];
