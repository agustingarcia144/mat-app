import React from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { useClerk } from "@clerk/expo";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function AccessDeniedScreen() {
  const { signOut } = useClerk();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [signingOut, setSigningOut] = React.useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <EmptyState
          title="Acceso restringido"
          description="Esta aplicación es solo para administradores y entrenadores. Si eres miembro, descarga la app Mat Gestion para acceder a tu plan."
        />

        <ThemedPressable
          type="primary"
          lightColor="#000"
          darkColor="#fff"
          style={styles.button}
          onPress={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color={isDark ? "#000" : "#fff"} />
          ) : (
            <ThemedText
              type="defaultSemiBold"
              lightColor="#fff"
              darkColor="#000"
            >
              Cerrar sesión
            </ThemedText>
          )}
        </ThemedPressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 24,
  },
  button: {
    height: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
});
