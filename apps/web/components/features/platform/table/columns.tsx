"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BILLING_STATUS_LABELS,
  BILLING_STATUS_VARIANTS,
  EMPTY_VALUE,
  SOURCE_VARIANTS,
  canRecordManualPayment,
  formatDay,
  formatRelative,
  getExpiresAt,
  getPlanLabel,
  getPlanVariant,
  getSourceLabel,
  type PlatformOrgRow,
} from "@/components/features/platform/platform-labels";

export interface PlatformOrgActions {
  onRecordPayment: (org: PlatformOrgRow) => void;
  onViewPayments: (org: PlatformOrgRow) => void;
}

export function getOrganizationInitials(name: string): string {
  return (
    name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

export const getColumns = (
  actions: PlatformOrgActions,
): ColumnDef<PlatformOrgRow>[] => [
  {
    accessorKey: "name",
    header: "Organización",
    cell: ({ row }) => {
      const org = row.original;
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            {org.logoUrl && <AvatarImage src={org.logoUrl} />}
            <AvatarFallback>{getOrganizationInitials(org.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium leading-tight">
              {org.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              @{org.slug}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Alta",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDay(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "source",
    header: "Origen",
    cell: ({ row }) => {
      const source = row.original.source;
      if (!source) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }
      return (
        <Badge variant={SOURCE_VARIANTS[source]}>
          {getSourceLabel(source)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "planKey",
    header: "Plan",
    cell: ({ row }) => {
      const org = row.original;
      if (!org.planKey) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }
      return <Badge variant={getPlanVariant(org)}>{getPlanLabel(org)}</Badge>;
    },
  },
  {
    accessorKey: "billingStatus",
    header: "Estado",
    cell: ({ row }) => {
      const status = row.original.billingStatus;
      return (
        <Badge variant={BILLING_STATUS_VARIANTS[status]}>
          {BILLING_STATUS_LABELS[status]}
        </Badge>
      );
    },
  },
  {
    id: "expiresAt",
    header: "Vence",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDay(getExpiresAt(row.original))}
      </span>
    ),
  },
  {
    id: "members",
    header: "Miembros",
    cell: ({ row }) => {
      const org = row.original;
      return (
        <span className="whitespace-nowrap tabular-nums">
          {org.activeMembers}
          <span className="text-muted-foreground"> / {org.totalMembers}</span>
        </span>
      );
    },
  },
  {
    accessorKey: "staffCount",
    header: "Staff",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.staffCount}</span>
    ),
  },
  {
    accessorKey: "lastActiveAt",
    header: "Últ. actividad",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatRelative(row.original.lastActiveAt)}
      </span>
    ),
  },
  {
    id: "lastManualPaymentAt",
    header: "Últ. pago",
    cell: ({ row }) => {
      const org = row.original;
      if (!canRecordManualPayment(org)) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }
      return (
        <span className="whitespace-nowrap">
          {formatDay(org.lastManualPaymentAt)}
        </span>
      );
    },
  },
  {
    id: "contact",
    header: "Contacto",
    cell: ({ row }) => {
      const org = row.original;
      const email = org.email ?? org.payerEmail;
      if (!email && !org.phone) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }
      return (
        <div className="flex max-w-[200px] flex-col">
          {email && <span className="truncate text-sm">{email}</span>}
          {org.phone && (
            <span className="truncate text-xs text-muted-foreground">
              {org.phone}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const org = row.original;
      const canRecord = canRecordManualPayment(org);
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
              disabled={!canRecord}
              onSelect={() => actions.onRecordPayment(org)}
            >
              {canRecord
                ? "Registrar pago"
                : "Registrar pago (solo legacy/manual)"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onViewPayments(org)}>
              Ver pagos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
