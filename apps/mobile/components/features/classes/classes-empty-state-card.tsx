import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

const matWolfLooking = require("@/assets/images/mat-wolf-looking.png");

interface ClassesEmptyStateCardProps {
  title?: string;
  subtext?: string;
  paddingBottom?: number;
}

export function ClassesEmptyStateCard({
  title = "No tienes reservas",
  subtext = "Reservá tu lugar en las próximas clases",
  paddingBottom = 0,
}: ClassesEmptyStateCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? "#3f3f46" : "#e4e4e7",
          paddingBottom: paddingBottom > 0 ? 16 + paddingBottom : 16,
        },
      ]}
    >
      <Image
        source={matWolfLooking}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel=""
      />
      <Text style={[styles.title, { color: isDark ? "#fafafa" : "#18181b" }]}>
        {title}
      </Text>
      <Text style={[styles.subtext, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
        {subtext}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
  },
  image: {
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  subtext: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    opacity: 0.9,
  },
});
