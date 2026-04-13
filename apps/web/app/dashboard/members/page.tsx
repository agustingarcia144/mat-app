"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import {
  getColumns,
  type MemberTableRow,
} from "@/components/features/members/table/columns";
import { mapMembershipsToMembers } from "@repo/core/utils";
import type { Member } from "@repo/core";
import DataTableSkeleton from "@/components/ui/data-table-skeleton";
import { Input } from "@/components/ui/input";
import MemberDetailDialog from "@/components/features/members/table/member-detail-dialog";
import { JoinRequestsCard } from "@/components/features/members/join-requests-card";
import { MemberInviteQrDialog } from "@/components/features/members/member-invite-qr-dialog";
import { Search, SlidersHorizontal } from "lucide-react";
import StatusBadge from "@/components/shared/badges/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? "";

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString();

const normalizeMemberStatus = (value?: string) => {
  const normalized = normalize(value);

  if (normalized === "activo") return "active";
  if (normalized === "inactivo") return "inactive";

  return normalized;
};

const PLAN_PAYMENT_STATUS_LABELS: Record<
  MemberTableRow["planPaymentStatus"],
  string
> = {
  pago: "Pago",
  pendiente: "Pendiente",
  vencido: "Vencido",
  none: "Sin plan",
};

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
};

type SortField =
  | "name"
  | "assignedPlanName"
  | "planPaymentStatus"
  | "status"
  | "createdAtValue";

type SortDirection = "asc" | "desc";

type AppliedFilters = {
  planSearch: string;
  planStatusFilter: "all" | MemberTableRow["planPaymentStatus"];
  statusFilter: "all" | "active" | "inactive";
  createdFrom: string;
  createdTo: string;
  sortField: SortField;
  sortDirection: SortDirection;
};

const DEFAULT_FILTERS: AppliedFilters = {
  planSearch: "",
  planStatusFilter: "all",
  statusFilter: "all",
  createdFrom: "",
  createdTo: "",
  sortField: "name",
  sortDirection: "asc",
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: "Nombre",
  assignedPlanName: "Plan",
  planPaymentStatus: "Estado del plan",
  status: "Estado",
  createdAtValue: "Fecha de creación",
};

const SORT_DIRECTION_LABELS: Record<SortDirection, string> = {
  asc: "Ascendente",
  desc: "Descendente",
};

export default function MembersPage() {
  const isMobile = useIsMobile();
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const payments = useQuery(
    api.planPayments.getByOrganization,
    canQueryCurrentOrganization ? {} : "skip",
  );

  const [nameSearch, setNameSearch] = useState("");
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [filters, setFilters] = useState<AppliedFilters>(DEFAULT_FILTERS);
  const [sheetFilters, setSheetFilters] =
    useState<AppliedFilters>(DEFAULT_FILTERS);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const columns = useMemo(() => getColumns(), []);
  const members = useMemo(
    () => mapMembershipsToMembers(memberships || []),
    [memberships],
  );
  const onlyMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          normalize(m.role) === "member" || normalize(m.role) === "miembro",
      ),
    [members],
  );

  const currentBillingPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const membersWithPlanData = useMemo<MemberTableRow[]>(() => {
    const membershipsByUser = new Map(
      (memberships ?? []).map((membership) => [membership.userId, membership]),
    );
    const latestSubscriptionByUser = new Map<string, any>();

    for (const subscription of subscriptions ?? []) {
      if (subscription.status === "cancelled") continue;

      const previous = latestSubscriptionByUser.get(subscription.userId);
      const previousUpdatedAt = previous?.updatedAt ?? previous?.createdAt ?? 0;
      const currentUpdatedAt =
        subscription.updatedAt ?? subscription.createdAt ?? 0;

      if (!previous || currentUpdatedAt > previousUpdatedAt) {
        latestSubscriptionByUser.set(subscription.userId, subscription);
      }
    }

    const currentPaymentBySubscription = new Map<string, any>();

    for (const payment of payments ?? []) {
      if (payment.billingPeriod !== currentBillingPeriod) continue;

      const key = String(payment.subscriptionId);
      const previous = currentPaymentBySubscription.get(key);
      const previousUpdatedAt = previous?.updatedAt ?? previous?.createdAt ?? 0;
      const currentUpdatedAt = payment.updatedAt ?? payment.createdAt ?? 0;

      if (!previous || currentUpdatedAt > previousUpdatedAt) {
        currentPaymentBySubscription.set(key, payment);
      }
    }

    return onlyMembers.map((member): MemberTableRow => {
      const membership = membershipsByUser.get(member.id);
      const subscription = latestSubscriptionByUser.get(member.id);
      const currentPayment = subscription
        ? currentPaymentBySubscription.get(String(subscription._id))
        : null;

      const assignedPlanName = subscription?.plan?.name ?? "Sin Plan";
      const createdAtValue = membership?.createdAt ?? 0;

      let planPaymentStatus: MemberTableRow["planPaymentStatus"] = "none";

      if (!subscription) {
        planPaymentStatus = "none";
      } else if (subscription.status === "suspended") {
        planPaymentStatus = "vencido";
      } else if (currentPayment?.status === "approved") {
        planPaymentStatus = "pago";
      } else {
        planPaymentStatus = "pendiente";
      }

      return {
        ...member,
        assignedPlanName,
        planPaymentStatus,
        createdAtValue,
        createdAtLabel: createdAtValue ? formatDate(createdAtValue) : "-",
      };
    });
  }, [currentBillingPeriod, memberships, onlyMembers, payments, subscriptions]);

  const activeFilterBadges = useMemo(() => {
    const badges = [
      filters.planSearch ? `Plan: ${filters.planSearch}` : null,
      filters.planStatusFilter !== "all"
        ? `Estado del plan: ${PLAN_PAYMENT_STATUS_LABELS[filters.planStatusFilter]}`
        : null,
      filters.statusFilter !== "all"
        ? `Estado: ${MEMBER_STATUS_LABELS[filters.statusFilter]}`
        : null,
      filters.createdFrom ? `Desde: ${filters.createdFrom}` : null,
      filters.createdTo ? `Hasta: ${filters.createdTo}` : null,
      filters.sortField !== "name" || filters.sortDirection !== "asc"
        ? `Orden: ${SORT_FIELD_LABELS[filters.sortField]} ${SORT_DIRECTION_LABELS[filters.sortDirection]}`
        : null,
    ].filter(Boolean) as string[];

    return badges;
  }, [filters]);

  const filteredAndSortedMembers = useMemo(() => {
    const normalizedNameSearch = normalize(nameSearch);
    const normalizedPlanSearch = normalize(filters.planSearch);
    const createdFromValue = filters.createdFrom
      ? new Date(`${filters.createdFrom}T00:00:00`).getTime()
      : null;
    const createdToValue = filters.createdTo
      ? new Date(`${filters.createdTo}T23:59:59.999`).getTime()
      : null;

    const filteredMembers = membersWithPlanData.filter((member) => {
      const normalizedStatus = normalizeMemberStatus(member.status);

      const matchesName =
        !normalizedNameSearch ||
        normalize(member.name).includes(normalizedNameSearch) ||
        normalize(member.email).includes(normalizedNameSearch);

      const matchesPlan =
        !normalizedPlanSearch ||
        normalize(member.assignedPlanName).includes(normalizedPlanSearch);

      const matchesPlanStatus =
        filters.planStatusFilter === "all" ||
        member.planPaymentStatus === filters.planStatusFilter;

      const matchesStatus =
        filters.statusFilter === "all" ||
        normalizedStatus === filters.statusFilter;

      const matchesCreatedFrom =
        createdFromValue === null || member.createdAtValue >= createdFromValue;

      const matchesCreatedTo =
        createdToValue === null || member.createdAtValue <= createdToValue;

      return (
        matchesName &&
        matchesPlan &&
        matchesPlanStatus &&
        matchesStatus &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });

    const sortedMembers = [...filteredMembers].sort((a, b) => {
      let comparison = 0;

      switch (filters.sortField) {
        case "createdAtValue":
          comparison = a.createdAtValue - b.createdAtValue;
          break;
        case "planPaymentStatus":
          comparison = PLAN_PAYMENT_STATUS_LABELS[
            a.planPaymentStatus
          ].localeCompare(
            PLAN_PAYMENT_STATUS_LABELS[b.planPaymentStatus],
            "es",
          );
          break;
        case "status":
          comparison = (
            MEMBER_STATUS_LABELS[normalizeMemberStatus(a.status)] ?? a.status
          ).localeCompare(
            MEMBER_STATUS_LABELS[normalizeMemberStatus(b.status)] ?? b.status,
            "es",
          );
          break;
        default:
          comparison = String(a[filters.sortField] ?? "").localeCompare(
            String(b[filters.sortField] ?? ""),
            "es",
            { sensitivity: "base" },
          );
          break;
      }

      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name, "es", {
          sensitivity: "base",
        });
      }

      return filters.sortDirection === "asc" ? comparison : -comparison;
    });

    return sortedMembers;
  }, [filters, membersWithPlanData, nameSearch]);

  const planOptions = useMemo(() => {
    return Array.from(
      new Set(
        membersWithPlanData
          .map((member) => member.assignedPlanName)
          .filter((value) => value.trim().length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [membersWithPlanData]);

  const openFilters = () => {
    setSheetFilters(filters);
    setFiltersSheetOpen(true);
  };

  const resetAllFilters = () => {
    setSheetFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  if (
    memberships === undefined ||
    subscriptions === undefined ||
    payments === undefined
  ) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <DataTableSkeleton columns={8} rows={10} />
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:py-10">
      <JoinRequestsCard />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar miembro..."
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="w-full pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ResponsiveActionButton
              variant="outline"
              mobileSize="sm"
              onClick={openFilters}
              icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
              label="Filtros"
              tooltip="Filtros"
            />

            {activeFilterBadges.slice(0, 3).map((label) => (
              <Badge key={label} variant="secondary" className="rounded-full">
                {label}
              </Badge>
            ))}

            {activeFilterBadges.length > 3 && (
              <Badge variant="secondary" className="rounded-full">
                +{activeFilterBadges.length - 3} más
              </Badge>
            )}
          </div>

          <div className="md:ml-auto">
            <MemberInviteQrDialog />
          </div>
        </div>
      </div>

      <datalist id="member-plan-options">
        {planOptions.map((plan) => (
          <option key={plan} value={plan} />
        ))}
      </datalist>

      {isMobile ? (
        <div className="space-y-2">
          {filteredAndSortedMembers.length === 0 ? (
            <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
              No se encontraron miembros.
            </div>
          ) : (
            filteredAndSortedMembers.map((member) => {
              const initials =
                member.fullName
                  ?.split(" ")
                  .map((name) => name[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) ||
                member.email?.[0]?.toUpperCase() ||
                "?";

              const isActive =
                normalizeMemberStatus(member.status) === "active";

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedMember(member)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {member.imageUrl && (
                          <AvatarImage src={member.imageUrl} />
                        )}
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email || "Sin email"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={isActive ? "active" : "inactive"} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredAndSortedMembers} />
      )}

      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Plan</p>
              <Input
                placeholder="Buscar por plan..."
                value={sheetFilters.planSearch}
                onChange={(e) =>
                  setSheetFilters((current) => ({
                    ...current,
                    planSearch: e.target.value,
                  }))
                }
                list="member-plan-options"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Estado del plan
              </p>
              <Select
                value={sheetFilters.planStatusFilter}
                onValueChange={(value) =>
                  setSheetFilters((current) => ({
                    ...current,
                    planStatusFilter:
                      value as AppliedFilters["planStatusFilter"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado del plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="none">Sin plan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Estado
              </p>
              <Select
                value={sheetFilters.statusFilter}
                onValueChange={(value) =>
                  setSheetFilters((current) => ({
                    ...current,
                    statusFilter: value as AppliedFilters["statusFilter"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Desde
                </p>
                <Input
                  type="date"
                  value={sheetFilters.createdFrom}
                  onChange={(e) =>
                    setSheetFilters((current) => ({
                      ...current,
                      createdFrom: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Hasta
                </p>
                <Input
                  type="date"
                  value={sheetFilters.createdTo}
                  onChange={(e) =>
                    setSheetFilters((current) => ({
                      ...current,
                      createdTo: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Ordenar por
              </p>
              <Select
                value={sheetFilters.sortField}
                onValueChange={(value) =>
                  setSheetFilters((current) => ({
                    ...current,
                    sortField: value as SortField,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Campo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nombre</SelectItem>
                  <SelectItem value="assignedPlanName">Plan</SelectItem>
                  <SelectItem value="planPaymentStatus">
                    Estado del plan
                  </SelectItem>
                  <SelectItem value="status">Estado</SelectItem>
                  <SelectItem value="createdAtValue">
                    Fecha de creación
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Dirección
              </p>
              <Select
                value={sheetFilters.sortDirection}
                onValueChange={(value) =>
                  setSheetFilters((current) => ({
                    ...current,
                    sortDirection: value as SortDirection,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Dirección" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascendente</SelectItem>
                  <SelectItem value="desc">Descendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="mt-8 gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setFiltersSheetOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={resetAllFilters}>
              Limpiar filtros
            </Button>
            <Button
              onClick={() => {
                setFilters(sheetFilters);
                setFiltersSheetOpen(false);
              }}
            >
              Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <MemberDetailDialog
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </DashboardPageContainer>
  );
}
