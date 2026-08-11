"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { isOrgAdminRole } from "@/lib/security/roles";

export type DashboardScope = "all" | "mine";

type DashboardScopeValue = {
  scope: DashboardScope;
  setScope: (scope: DashboardScope) => void;
  /** Only admins choose; everyone else is pinned to their own members. */
  canToggle: boolean;
  isLoading: boolean;
  myUserId: string | undefined;
  organizationName: string | undefined;
  role: string | undefined;
  /** Ready to pass to Convex queries: undefined means "whole org". */
  responsibleUserId: string | undefined;
};

const DashboardScopeContext = createContext<DashboardScopeValue | null>(null);

function storageKey(organizationId: string) {
  return `mat:dashboard-scope:${organizationId}`;
}

/**
 * The persisted choice lives in localStorage and is read through
 * useSyncExternalStore so the server render (no value) and the client stay in
 * sync without an effect.
 */
const listeners = new Set<() => void>();
/** Fallback when localStorage is unavailable (private mode, blocked cookies). */
const memoryScopes = new Map<string, DashboardScope>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readScope(key: string | null): DashboardScope | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "mine" || raw === "all") return raw;
  } catch {
    // Ignore and fall through to the in-memory value.
  }
  return memoryScopes.get(key) ?? null;
}

function writeScope(key: string, scope: DashboardScope) {
  memoryScopes.set(key, scope);
  try {
    window.localStorage.setItem(key, scope);
  } catch {
    // Keep it in memory only.
  }
  listeners.forEach((listener) => listener());
}

export function DashboardScopeProvider({ children }: { children: ReactNode }) {
  const membership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
  );

  const canToggle = isOrgAdminRole(membership?.role);
  const organizationId = membership?.organizationId as string | undefined;
  const key = organizationId ? storageKey(organizationId) : null;

  const storedScope = useSyncExternalStore(
    subscribe,
    useCallback(() => readScope(key), [key]),
    () => null,
  );

  const setScope = useCallback(
    (next: DashboardScope) => {
      if (!key) return;
      writeScope(key, next);
    },
    [key],
  );

  const value = useMemo<DashboardScopeValue>(() => {
    const scope: DashboardScope = canToggle ? (storedScope ?? "all") : "mine";
    const myUserId = membership?.userId;

    return {
      scope,
      setScope,
      canToggle,
      isLoading: membership === undefined,
      myUserId,
      organizationName: membership?.organization?.name,
      role: membership?.role,
      responsibleUserId: scope === "mine" ? myUserId : undefined,
    };
  }, [canToggle, storedScope, membership, setScope]);

  return (
    <DashboardScopeContext.Provider value={value}>
      {children}
    </DashboardScopeContext.Provider>
  );
}

export function useDashboardScope() {
  const context = useContext(DashboardScopeContext);
  if (!context) {
    throw new Error(
      "useDashboardScope must be used inside a DashboardScopeProvider",
    );
  }
  return context;
}
