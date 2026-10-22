"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import { getColumns } from "@/components/features/users/table/columns";
import { InviteUserDialog } from "@/components/features/users/invite-user-dialog";
import { PendingInvitationsCard } from "@/components/features/users/pending-invitations-card";
import { mapMembershipsToMembers } from "@repo/core/utils";
import type { Member } from "@repo/core";
import { Input } from "@/components/ui/input";
import MemberDetailDialog from "@/components/features/members/table/member-detail-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RoleBadge from "@/components/shared/badges/role-badge";
import StatusBadge from "@/components/shared/badges/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StaffShiftsPanel from "@/components/features/team/staff-shifts-panel";
import PayrollPanel from "@/components/features/team/payroll-panel";
import type { StaffOption } from "@/components/features/team/staff-select";
import { cn } from "@/lib/utils";

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? "";

const ROLE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "admin", label: "Admins" },
  { value: "trainer", label: "Entrenadores" },
  { value: "employee", label: "Empleados" },
] as const;

type RoleFilter = (typeof ROLE_FILTERS)[number]["value"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  trainer: "Entrenador",
  employee: "Empleado",
  member: "Miembro",
};

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role?.toLowerCase()] ?? role ?? "—";
}

function getInitials(user: Member) {
  return (
    user.fullName
      ?.split(" ")
      .map((name) => name[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    user.email?.[0]?.toUpperCase() ||
    "?"
  );
}

function CountPill({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

export default function UsuariosPage() {
  const isMobile = useIsMobile();
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembership,
  );
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);

  const users = useMemo(() => {
    const all = mapMembershipsToMembers(memberships ?? []);
    return all.filter(
      (m) => normalize(m.role) !== "member" && normalize(m.role) !== "miembro",
    );
  }, [memberships]);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const staffOptions = useMemo<StaffOption[]>(
    () =>
      users.map((u) => ({
        userId: u.id,
        fullName: u.fullName ?? u.name,
        email: u.email,
        role: u.role,
      })),
    [users],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = {
      all: users.length,
      admin: 0,
      trainer: 0,
      employee: 0,
    };
    for (const user of users) {
      const role = normalize(user.role);
      if (role in counts) counts[role as RoleFilter] += 1;
    }
    return counts;
  }, [users]);

  const columns = useMemo(() => getColumns(), []);

  const filteredUsers = useMemo(() => {
    const searchValue = normalize(search);
    return users.filter((m: Member): boolean => {
      const matchesRole =
        roleFilter === "all" || normalize(m.role) === roleFilter;
      const matchesSearch =
        !searchValue ||
        normalize(m.name).includes(searchValue) ||
        normalize(m.email).includes(searchValue) ||
        normalize(getRoleLabel(m.role)).includes(searchValue);
      return matchesRole && matchesSearch;
    });
  }, [users, search, roleFilter]);

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">Mi equipo</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Personal del gimnasio, sus turnos y sus sueldos.
        </p>
      </div>
      {currentMembership?.role === "admin" && (
        <Button
          className="gap-1.5 self-start"
          onClick={() => setInviteDialogOpen(true)}
        >
          <Plus className="size-4" />
          Invitar al equipo
        </Button>
      )}
    </div>
  );

  if (memberships === undefined || currentMembership === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-[360px] rounded-xl" />
      </DashboardPageContainer>
    );
  }

  if (currentMembership?.role !== "admin") {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Solo administradores pueden gestionar el equipo.
        </p>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {header}

      <Tabs defaultValue="equipo" className="space-y-4">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="equipo" className="gap-2">
            Equipo
            <CountPill count={users.length} />
          </TabsTrigger>
          <TabsTrigger value="turnos">Turnos</TabsTrigger>
          <TabsTrigger value="nomina">Sueldos</TabsTrigger>
        </TabsList>

        <TabsContent value="equipo" className="space-y-4">
          <PendingInvitationsCard refreshKey={inviteRefreshKey} />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Filtrar por rol"
            >
              {ROLE_FILTERS.map((filter) => {
                const isActive = roleFilter === filter.value;
                const count = roleCounts[filter.value];
                if (filter.value !== "all" && count === 0) return null;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setRoleFilter(filter.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                      isActive
                        ? "border-foreground/20 bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    <span className="text-xs tabular-nums opacity-70">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o rol"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center">
              <p className="text-sm font-medium">No se encontraron usuarios</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Probá con otro nombre o cambiá el filtro de rol.
              </p>
            </div>
          ) : isMobile ? (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {filteredUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedMember(user)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <Avatar className="size-9 shrink-0">
                      {user.imageUrl && <AvatarImage src={user.imageUrl} />}
                      <AvatarFallback>{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {user.name}
                        </p>
                        <StatusBadge
                          status={
                            normalize(user.status) === "active"
                              ? "active"
                              : "inactive"
                          }
                        />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email || "Sin email"}
                      </p>
                      <RoleBadge role={user.role ?? ""} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <DataTable columns={columns} data={filteredUsers} />
          )}
        </TabsContent>

        <TabsContent value="turnos">
          <StaffShiftsPanel staff={staffOptions} />
        </TabsContent>

        <TabsContent value="nomina">
          <PayrollPanel />
        </TabsContent>
      </Tabs>

      <MemberDetailDialog
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onInvited={() => setInviteRefreshKey((current) => current + 1)}
      />
    </DashboardPageContainer>
  );
}
