import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useClerk } from "@clerk/expo";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppReset } from "@/components/providers/providers";
import { captureHandledError } from "@/lib/sentry";
import { getOrgRoleLabel } from "@/lib/security/roles";

export default function SelectOrganizationScreen() {
  const { isAuthenticated } = useConvexAuth();
  const staffOrganizations = useQuery(
    api.organizationMemberships.getMyStaffOrganizations,
    isAuthenticated ? {} : "skip",
  );
  const router = useRouter();
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization,
  );
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { resetApp } = useAppReset();
  const { signOut } = useClerk();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSelectedOrgId, setLastSelectedOrgId] = useState<string | null>(
    null,
  );
  const hasAttemptedAutoSelect = useRef(false);

  const validOrganizations = React.useMemo(
    () =>
      (staffOrganizations ?? []).filter(
        (organization) =>
          typeof organization.organizationId === "string" &&
          organization.organizationId.length > 0,
      ),
    [staffOrganizations],
  );
  const isLoaded = staffOrganizations !== undefined;

  const handleSelectOrg = useCallback(
    async (organizationId: string) => {
      if (!organizationId) {
        setError("No se pudo identificar la organización seleccionada.");
        return;
      }

      setLoading(true);
      setError(null);
      setLastSelectedOrgId(organizationId);
      try {
        await setActiveOrganization({
          organizationId: organizationId as never,
        });
        resetApp();
        router.replace("/");
      } catch (err) {
        captureHandledError(err, {
          area: "organization",
          action: "set_active_organization",
          extras: { organizationId },
        });
        setError(
          "No pudimos cambiar de organización. Revisa tu conexión e intenta nuevamente.",
        );
      } finally {
        setLoading(false);
      }
    },
    [resetApp, router, setActiveOrganization],
  );

  useEffect(() => {
    if (isLoaded && !hasAttemptedAutoSelect.current) {
      if (validOrganizations.length === 1) {
        const onlyOrganizationId = validOrganizations[0].organizationId;
        hasAttemptedAutoSelect.current = true;
        if (onlyOrganizationId) {
          handleSelectOrg(onlyOrganizationId);
        }
      }
    }
  }, [handleSelectOrg, isLoaded, validOrganizations]);

  if (!isLoaded || loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  if (validOrganizations.length === 0) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <View style={styles.emptyWrapper}>
          <EmptyState
            title="Sin organizaciones disponibles"
            description="No tienes acceso de administrador o entrenador a ninguna organización."
          />
          <ThemedPressable
            type="secondary"
            lightColor="#f4f4f5"
            darkColor="#18181b"
            style={styles.signOutButton}
            onPress={async () => {
              await signOut();
            }}
          >
            <ThemedText type="defaultSemiBold">Cerrar sesión</ThemedText>
          </ThemedPressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Seleccionar organización
        </ThemedText>
        <ThemedText
          style={[
            styles.subtitle,
            { color: isDark ? "#a1a1aa" : "#71717a" },
          ]}
        >
          Elige a qué organización deseas acceder
        </ThemedText>
        {error ? (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            {lastSelectedOrgId ? (
              <ThemedPressable
                type="secondary"
                lightColor="#e4e4e7"
                darkColor="#27272a"
                style={styles.retryButton}
                onPress={() => handleSelectOrg(lastSelectedOrgId)}
              >
                <ThemedText>Reintentar</ThemedText>
              </ThemedPressable>
            ) : null}
          </View>
        ) : null}

        <FlatList
          data={validOrganizations}
          keyExtractor={(item, index) => `${item.organizationId}-${index}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[
                styles.orgCard,
                { borderColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
              onPress={() => {
                if (item.organizationId) {
                  void handleSelectOrg(item.organizationId);
                }
              }}
            >
              <View style={styles.orgInfo}>
                <ThemedText type="defaultSemiBold" style={styles.orgName}>
                  {item.organizationName ?? ""}
                </ThemedText>
                {item.organizationSlug ? (
                  <ThemedText
                    style={[
                      styles.orgSlug,
                      { color: isDark ? "#71717a" : "#a1a1aa" },
                    ]}
                  >
                    {item.organizationSlug}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText
                style={[
                  styles.roleText,
                  { color: isDark ? "#a1a1aa" : "#71717a" },
                ]}
              >
                {getOrgRoleLabel(item.role)}
              </ThemedText>
            </ThemedPressable>
          )}
        />

        <ThemedPressable
          onPress={async () => {
            await signOut();
          }}
          style={styles.signOutLink}
        >
          <ThemedText
            style={{ color: isDark ? "#a1a1aa" : "#71717a", textAlign: "center" }}
          >
            Cerrar sesión
          </ThemedText>
        </ThemedPressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  errorContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444",
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  list: {
    gap: 12,
  },
  orgCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 18,
    marginBottom: 4,
  },
  orgSlug: {
    fontSize: 14,
  },
  roleText: {
    fontSize: 14,
    textTransform: "capitalize",
  },
  emptyWrapper: {
    alignItems: "center",
    gap: 16,
  },
  signOutButton: {
    minHeight: 48,
    paddingHorizontal: 32,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutLink: {
    paddingVertical: 16,
  },
});
