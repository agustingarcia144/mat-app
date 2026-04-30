import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import { useClerk } from "@clerk/expo";
import { useAction } from "convex/react";
import { api } from "@repo/convex";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";

export default function ManageAccountScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const deleteMyAccount = useAction(api.userDeletion.deleteMyAccount);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const headerHeight = useHeaderHeight();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const backgroundColor = isDark ? "#111111" : "#fff";
  const buttonBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";

  const runDelete = React.useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await deleteMyAccount({});
      await signOut();
      // Root _layout redirects unauthenticated users back to `/`.
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "No se pudo eliminar la cuenta.";
      setError(msg);
      Alert.alert("Error", msg);
    } finally {
      setPending(false);
    }
  }, [deleteMyAccount, signOut]);

  const onPressDelete = React.useCallback(() => {
    Alert.alert(
      "¿Eliminar cuenta permanentemente?",
      "Se eliminarán tu cuenta de acceso y tus datos personales en la app. Si tienes una suscripción en App Store, cancélala en Ajustes > Apple ID > Suscripciones. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            void runDelete();
          },
        },
      ],
    );
  }, [runDelete]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: headerHeight + 24,
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <ThemedText type="title" style={styles.title}>
        Administrar cuenta
      </ThemedText>

      <ThemedText style={styles.body}>
        Desde aquí puedes eliminar tu cuenta de forma permanente. Perderás el
        acceso a tus gimnasios, entrenamientos y reservas asociados a esta
        cuenta.
      </ThemedText>

      {error ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <ThemedPressable
          type="secondary"
          lightColor="transparent"
          darkColor="transparent"
          disabled={pending}
          style={[
            styles.deleteButton,
            {
              borderColor: "#ef4444",
              opacity: pending ? 0.6 : 1,
            },
          ]}
          onPress={onPressDelete}
          accessibilityRole="button"
          accessibilityLabel="Eliminar mi cuenta permanentemente"
        >
          {pending ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Text style={styles.deleteButtonText}>
              Eliminar mi cuenta permanentemente
            </Text>
          )}
        </ThemedPressable>

        <ThemedPressable
          type="secondary"
          lightColor={buttonBg}
          darkColor={buttonBg}
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text
            style={[
              styles.cancelButtonText,
              { color: isDark ? "#fff" : "#000" },
            ]}
          >
            Volver
          </Text>
        </ThemedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.9,
    marginBottom: 32,
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
  },
  actions: {
    gap: 12,
  },
  deleteButton: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ef4444",
  },
  cancelButton: {
    height: 48,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
