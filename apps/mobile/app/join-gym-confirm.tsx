import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useAction } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { usePendingJoin } from "@/contexts/pending-join-context";

export default function JoinGymConfirmScreen() {
  const {
    pendingToken,
    clearPending,
    isLoading: pendingLoading,
  } = usePendingJoin();
  const getJoinPreview = useAction(api.joinGym.getJoinPreview);
  const joinGymByToken = useAction(api.joinGym.joinGymByToken);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [preview, setPreview] = useState<{
    name: string;
    logoUrl?: string;
    alreadyMember: boolean;
    _requestSubmitted?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  useEffect(() => {
    if (!pendingToken || pendingLoading) {
      if (!pendingToken && !pendingLoading) {
        router.replace("/");
      }
      return;
    }

    let cancelled = false;
    setFetchLoading(true);
    setError(null);
    getJoinPreview({ token: pendingToken })
      .then((data) => {
        if (!cancelled) {
          setPreview({
            name: data.name,
            logoUrl: data.logoUrl,
            alreadyMember: data.alreadyMember,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e?.message ?? "Link inválido o vencido";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setFetchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pendingToken, pendingLoading, getJoinPreview, router]);

  const handleJoin = useCallback(async () => {
    if (!pendingToken || joinLoading) return;
    setJoinLoading(true);
    setError(null);
    try {
      const result = await joinGymByToken({ token: pendingToken });
      await clearPending();
      if (result.pending) {
        setPreview((p) => (p ? { ...p, _requestSubmitted: true } : null));
        return;
      }
      router.replace("/select-organization");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo unir al gimnasio");
    } finally {
      setJoinLoading(false);
    }
  }, [pendingToken, joinGymByToken, clearPending, router, joinLoading]);

  const handleCancel = useCallback(async () => {
    await clearPending();
    router.replace("/select-organization");
  }, [clearPending, router]);

  const handleDismissError = useCallback(async () => {
    setError(null);
    await clearPending();
    router.replace("/select-organization");
  }, [clearPending, router]);

  if (pendingLoading || !pendingToken) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  if (fetchLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          styles.padded,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <Text style={[styles.errorTitle, { color: isDark ? "#fff" : "#000" }]}>
          Link inválido o vencido
        </Text>
        <Text
          style={[
            styles.errorMessage,
            { color: isDark ? "#a1a1aa" : "#71717a" },
          ]}
        >
          {error}
        </Text>
        <ThemedPressable
          type="primary"
          lightColor="#18181b"
          darkColor="#f4f4f5"
          style={styles.button}
          onPress={handleDismissError}
        >
          <Text
            style={[styles.buttonText, { color: isDark ? "#000" : "#fff" }]}
          >
            Continuar
          </Text>
        </ThemedPressable>
      </View>
    );
  }

  if (!preview) {
    return null;
  }

  const { name, logoUrl, alreadyMember, _requestSubmitted } = preview;

  if (_requestSubmitted) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          styles.padded,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <Text style={[styles.title, { color: isDark ? "#fff" : "#000" }]}>
          Solicitud enviada
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: isDark ? "#71717a" : "#a1a1aa" },
            { marginBottom: 24 },
          ]}
        >
          El gimnasio {name} revisará tu solicitud. Te notificaremos cuando te
          aprueben.
        </Text>
        <ThemedPressable
          type="primary"
          lightColor="#18181b"
          darkColor="#f4f4f5"
          style={styles.button}
          onPress={() => router.replace("/select-organization")}
        >
          <Text
            style={[styles.buttonText, { color: isDark ? "#000" : "#fff" }]}
          >
            Continuar
          </Text>
        </ThemedPressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.padded,
        { backgroundColor: isDark ? "#000" : "#fff" },
      ]}
    >
      <View style={styles.content}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.logoPlaceholder,
              { backgroundColor: isDark ? "#27272a" : "#e4e4e7" },
            ]}
          >
            <Text
              style={[
                styles.logoLetter,
                { color: isDark ? "#a1a1aa" : "#71717a" },
              ]}
            >
              {name.charAt(0)}
            </Text>
          </View>
        )}
        <Text style={[styles.title, { color: isDark ? "#fff" : "#000" }]}>
          {alreadyMember ? "Ya sos miembro" : "¿Querés unirte a este gimnasio?"}
        </Text>
        <Text
          style={[styles.gymName, { color: isDark ? "#a1a1aa" : "#71717a" }]}
        >
          {name}
        </Text>
        {alreadyMember ? (
          <Text
            style={[styles.subtitle, { color: isDark ? "#71717a" : "#a1a1aa" }]}
          >
            Ya tenés acceso. Podés elegirlo desde la lista de organizaciones.
          </Text>
        ) : (
          <Text
            style={[styles.subtitle, { color: isDark ? "#71717a" : "#a1a1aa" }]}
          >
            Al confirmar, se te agregará como miembro de este gimnasio.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {alreadyMember ? (
          <ThemedPressable
            type="primary"
            lightColor="#18181b"
            darkColor="#f4f4f5"
            style={styles.button}
            onPress={handleCancel}
          >
            <Text
              style={[styles.buttonText, { color: isDark ? "#000" : "#fff" }]}
            >
              Continuar
            </Text>
          </ThemedPressable>
        ) : (
          <>
            <ThemedPressable
              type="primary"
              lightColor="#18181b"
              darkColor="#f4f4f5"
              style={styles.button}
              onPress={handleJoin}
              disabled={joinLoading}
            >
              {joinLoading ? (
                <ActivityIndicator
                  size="small"
                  color={isDark ? "#000" : "#fff"}
                />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? "#000" : "#fff" },
                  ]}
                >
                  Unirme
                </Text>
              )}
            </ThemedPressable>
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={joinLoading}
            >
              <Text
                style={[styles.buttonText, { color: isDark ? "#fff" : "#000" }]}
              >
                Cancelar
              </Text>
            </ThemedPressable>
          </>
        )}
      </View>
    </View>
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
  padded: {
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 24,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: {
    fontSize: 32,
    fontWeight: "bold",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  gymName: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  actions: {
    gap: 12,
    paddingBottom: 40,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
});
