import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ui/themed-text";

export function RestDayPlaceholder() {
  return (
    <View style={[styles.container, styles.centered]}>
      <Image
        source={require("@/assets/images/mat-wolf-sleep.png")}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="Día de descanso"
      />
      <ThemedText style={styles.title}>Día de descanso</ThemedText>
      <ThemedText style={styles.subtext}>
        No hay rutina programada para este día
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 32,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: 220,
    height: 220,
    marginBottom: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  subtext: {
    fontSize: 15,
    marginTop: 10,
    opacity: 0.8,
    textAlign: "center",
  },
});
