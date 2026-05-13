import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export type MemberRowProps = {
  name: string;
  email?: string;
  imageUrl?: string;
  status?: string;
  onPress: () => void;
};

function getInitials(name: string, email?: string) {
  const fromName = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  if (fromName) return fromName;
  if (email) return email[0]?.toUpperCase() ?? "?";
  return "?";
}

export function MemberRow({
  name,
  email,
  imageUrl,
  status,
  onPress,
}: MemberRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const initials = getInitials(name, email);
  const isActive =
    !status ||
    status.toLowerCase() === "active" ||
    status.toLowerCase() === "activo";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <View style={styles.avatarWrapper}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              {
                backgroundColor: isDark ? "#27272a" : "#e4e4e7",
              },
            ]}
          >
            <ThemedText style={styles.avatarText}>{initials}</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.main}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText
          numberOfLines={1}
          style={[
            styles.subtitle,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          {email ?? "Sin email"}
        </ThemedText>
      </View>

      <View
        style={[
          styles.badge,
          {
            backgroundColor: isActive
              ? isDark
                ? "rgba(34,197,94,0.22)"
                : "#dcfce7"
              : isDark
                ? "rgba(239,68,68,0.22)"
                : "#fee2e2",
          },
        ]}
      >
        <ThemedText
          style={[
            styles.badgeText,
            {
              color: isActive
                ? isDark
                  ? "#86efac"
                  : "#166534"
                : isDark
                  ? "#fca5a5"
                  : "#991b1b",
            },
          ]}
        >
          {isActive ? "Activo" : "Inactivo"}
        </ThemedText>
      </View>
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
