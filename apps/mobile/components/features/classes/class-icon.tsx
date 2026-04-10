import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface ClassIconProps {
  className: string;
  isDark: boolean;
}

export function ClassIcon({ className, isDark }: ClassIconProps) {
  return (
    <View
      style={[
        styles.classIcon,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.5)",
        },
      ]}
    >
      <Text
        style={[styles.classIconText, { color: isDark ? "#e4e4e7" : "#fff" }]}
      >
        {(className || "C").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  classIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  classIconText: {
    fontSize: 18,
    fontWeight: "700",
  },
});
