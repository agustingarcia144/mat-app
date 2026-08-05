"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BILLING_ACCESS_VARIANTS,
  CODE_STATUS_LABELS,
  CODE_STATUS_VARIANTS,
  EMPTY_VALUE,
  formatDay,
  getBillingAccessLabel,
  type PlatformCodeRow,
} from "@/components/features/platform/platform-labels";

export interface PlatformCodeActions {
  onRevoke: (code: PlatformCodeRow) => void;
}

export const getCodeColumns = (
  actions: PlatformCodeActions,
): ColumnDef<PlatformCodeRow>[] => [
  {
    accessorKey: "label",
    header: "Etiqueta",
    cell: ({ row }) => {
      const code = row.original;
      return (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium leading-tight">
            {code.label ?? "Sin etiqueta"}
          </span>
          {code.notes && (
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">
              {code.notes}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "billingAccess",
    header: "Acceso",
    cell: ({ row }) => (
      <Badge
        variant={
          BILLING_ACCESS_VARIANTS[row.original.billingAccess ?? "legacy"]
        }
      >
        {getBillingAccessLabel(row.original.billingAccess)}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={CODE_STATUS_VARIANTS[row.original.status]}>
        {CODE_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
  {
    id: "uses",
    header: "Usos",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.usedCount}
        <span className="text-muted-foreground"> / {row.original.maxUses}</span>
      </span>
    ),
  },
  {
    accessorKey: "expiresAt",
    header: "Vence",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDay(row.original.expiresAt)}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Creado",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDay(row.original.createdAt)}
      </span>
    ),
  },
  {
    id: "consumedOrganization",
    header: "Organización",
    cell: ({ row }) => {
      const code = row.original;
      if (!code.consumedOrganizationName) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }
      return (
        <div className="flex max-w-[200px] flex-col">
          <span className="truncate text-sm">
            {code.consumedOrganizationName}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            @{code.consumedOrganizationSlug}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const code = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Acciones</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={code.status !== "active"}
              onSelect={() => actions.onRevoke(code)}
            >
              Revocar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
