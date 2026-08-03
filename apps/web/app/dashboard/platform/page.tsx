"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import DataTableSkeleton from "@/components/ui/data-table-skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import PlatformSummaryCards from "@/components/features/platform/platform-summary-cards";
import {
  getColumns,
  getOrganizationInitials,
} from "@/components/features/platform/table/columns";
import {
  BILLING_STATUS_LABELS,
  BILLING_STATUS_ORDER,
  BILLING_STATUS_VARIANTS,
  PLAN_LABELS,
  PLAN_ORDER,
  SOURCE_LABELS,
  SOURCE_ORDER,
  SOURCE_VARIANTS,
  formatDay,
  getPlanLabel,
  getPlanVariant,
  getSourceLabel,
} from "@/components/features/platform/platform-labels";

const ALL = "all";

const normalize = (value?: string | null) =>
  value?.toString().trim().toLowerCase() ?? "";

export default function PlataformaPage() {
  const isMobile = useIsMobile();
  const { isSuperAdmin, isLoading } = useIsSuperAdmin();

  // Gate the query on isSuperAdmin: the Convex side throws for everyone else,
  // and an unguarded useQuery would surface that as a thrown render error.
  const organizations = useQuery(
    api.platformInsights.listOrganizations,
    isSuperAdmin ? {} : "skip",
  );

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const columns = useMemo(() => getColumns(), []);

  const filtered = useMemo(() => {
    const searchValue = normalize(search);
    return (organizations ?? []).filter((org) => {
      if (planFilter !== ALL && org.planKey !== planFilter) return false;
      if (sourceFilter !== ALL && org.source !== sourceFilter) return false;
      if (statusFilter !== ALL && org.billingStatus !== statusFilter)
        return false;
      if (!searchValue) return true;
      return (
        normalize(org.name).includes(searchValue) ||
        normalize(org.slug).includes(searchValue) ||
        normalize(org.email).includes(searchValue) ||
        normalize(org.payerEmail).includes(searchValue)
      );
    });
  }, [organizations, search, planFilter, sourceFilter, statusFilter]);

  if (isLoading) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <DataTableSkeleton columns={8} rows={10} />
      </DashboardPageContainer>
    );
  }

  if (!isSuperAdmin) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo super administradores pueden ver esta página.
        </div>
      </DashboardPageContainer>
    );
  }

  if (organizations === undefined) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <DataTableSkeleton columns={8} rows={10} />
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:py-10">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Plataforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las organizaciones de la app: cuándo se dieron de alta, por qué
          medio y con qué plan.
        </p>
      </div>

      <PlatformSummaryCards organizations={organizations} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, slug o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-10"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:w-auto">
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="h-10 md:w-[150px]">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los planes</SelectItem>
              {PLAN_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {PLAN_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-10 md:w-[170px]">
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los orígenes</SelectItem>
              {SOURCE_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {SOURCE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 md:w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {BILLING_STATUS_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {BILLING_STATUS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
              No se encontraron organizaciones.
            </div>
          ) : (
            filtered.map((org) => (
              <div
                key={org.organizationId}
                className="rounded-lg border p-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    {org.logoUrl && <AvatarImage src={org.logoUrl} />}
                    <AvatarFallback>
                      {getOrganizationInitials(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{org.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Alta: {formatDay(org.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
                  {org.source && (
                    <Badge variant={SOURCE_VARIANTS[org.source]}>
                      {getSourceLabel(org.source)}
                    </Badge>
                  )}
                  {org.planKey && (
                    <Badge variant={getPlanVariant(org)}>
                      {getPlanLabel(org)}
                    </Badge>
                  )}
                  <Badge variant={BILLING_STATUS_VARIANTS[org.billingStatus]}>
                    {BILLING_STATUS_LABELS[org.billingStatus]}
                  </Badge>
                </div>

                <p className="mt-2 pl-12 text-xs text-muted-foreground">
                  {org.activeMembers}/{org.totalMembers} miembros ·{" "}
                  {org.staffCount} staff
                </p>
              </div>
            ))
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}
    </DashboardPageContainer>
  );
}
