import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@repo/convex";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getRewardTheme,
  REDEMPTION_STATUS_LABELS,
  REWARD_ACCENT,
  rewardDate,
} from "@/components/features/rewards";

const notesWolf = require("@/assets/images/mat-wolf-notes.png");

function ActivityContent() {
  const isDark = useColorScheme() === "dark";
  const theme = getRewardTheme(isDark);
  const data = useQuery(api.rewards.getMyRewards);
  const [segment, setSegment] = useState<"points" | "redemptions">("points");

  const rewardNames = useMemo(
    () =>
      new Map(
        data?.rewards.map((reward) => [String(reward._id), reward.name]) ?? [],
      ),
    [data?.rewards],
  );

  if (data === undefined) return <LoadingScreen />;
  if (!data?.enabled)
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  const empty =
    segment === "points"
      ? data.ledger.length === 0
      : data.redemptions.length === 0;
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        Actividad reciente
      </Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        Tus últimos movimientos y canjes en un solo lugar.
      </Text>

      <View
        style={[
          styles.segmented,
          { backgroundColor: isDark ? "#27272A" : "#EDEDEF" },
        ]}
        accessibilityRole="tablist"
      >
        <SegmentButton
          label="Puntos"
          selected={segment === "points"}
          onPress={() => setSegment("points")}
          isDark={isDark}
        />
        <SegmentButton
          label="Canjes"
          selected={segment === "redemptions"}
          onPress={() => setSegment("redemptions")}
          isDark={isDark}
        />
      </View>

      {empty ? (
        <View style={styles.empty}>
          <Image
            source={notesWolf}
            style={styles.wolf}
            contentFit="contain"
            accessibilityLabel="Mati preparando tu actividad"
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {segment === "points"
              ? "Todavía no hay movimientos"
              : "Todavía no hiciste canjes"}
          </Text>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            {segment === "points"
              ? "Tu primera visita aparecerá acá."
              : "Cuando elijas un beneficio, vas a poder seguir su estado acá."}
          </Text>
        </View>
      ) : segment === "points" ? (
        <View
          style={[
            styles.list,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {data.ledger.map((entry, index) => (
            <View key={entry._id}>
              <View style={styles.row}>
                <View
                  style={[
                    styles.icon,
                    {
                      backgroundColor:
                        entry.points > 0 ? theme.greenSoft : theme.orangeSoft,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={entry.points > 0 ? "add" : "remove"}
                    size={19}
                    color={entry.points > 0 ? "#22C55E" : REWARD_ACCENT}
                  />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {entry.reason}
                  </Text>
                  <Text style={[styles.rowMeta, { color: theme.muted }]}>
                    {rewardDate(entry.createdAt)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.points,
                    { color: entry.points > 0 ? "#22C55E" : REWARD_ACCENT },
                  ]}
                >
                  {entry.points > 0 ? "+" : ""}
                  {entry.points}
                </Text>
              </View>
              {index < data.ledger.length - 1 ? (
                <View
                  style={[styles.separator, { backgroundColor: theme.border }]}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.list,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {data.redemptions.map((redemption, index) => {
            const statusColor =
              redemption.status === "fulfilled"
                ? "#22C55E"
                : redemption.status === "cancelled"
                  ? "#EF4444"
                  : redemption.status === "ready"
                    ? REWARD_ACCENT
                    : theme.muted;
            return (
              <View key={redemption._id}>
                <View style={styles.row}>
                  <View
                    style={[styles.icon, { backgroundColor: theme.orangeSoft }]}
                  >
                    <MaterialIcons
                      name="redeem"
                      size={19}
                      color={REWARD_ACCENT}
                    />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>
                      {rewardNames.get(String(redemption.rewardDefinitionId)) ??
                        "Recompensa"}
                    </Text>
                    <Text style={[styles.rowMeta, { color: statusColor }]}>
                      {REDEMPTION_STATUS_LABELS[redemption.status]} ·{" "}
                      {rewardDate(redemption.createdAt)}
                    </Text>
                  </View>
                  <Text style={[styles.points, { color: theme.muted }]}>
                    -{redemption.pointsCost}
                  </Text>
                </View>
                {index < data.redemptions.length - 1 ? (
                  <View
                    style={[
                      styles.separator,
                      { backgroundColor: theme.border },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <Text style={[styles.limitNote, { color: theme.subtle }]}>
        {segment === "points"
          ? "Se muestran los últimos 50 movimientos."
          : "Se muestran los últimos 25 canjes."}
      </Text>
    </ScrollView>
  );
}

function SegmentButton({
  label,
  selected,
  onPress,
  isDark,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[
        styles.segment,
        selected && { backgroundColor: isDark ? "#3F3F46" : "#FFFFFF" },
      ]}
    >
      <Text
        style={[
          styles.segmentText,
          {
            color: selected
              ? isDark
                ? "#FFFFFF"
                : "#18181B"
              : isDark
                ? "#A1A1AA"
                : "#71717A",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ActivityScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <ActivityContent />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 104, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { marginTop: 7, fontSize: 14, lineHeight: 20 },
  segmented: {
    flexDirection: "row",
    borderRadius: 15,
    padding: 4,
    marginTop: 24,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  segmentText: { fontSize: 13, fontWeight: "800" },
  list: {
    marginTop: 18,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
    overflow: "hidden",
  },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14, lineHeight: 18, fontWeight: "700" },
  rowMeta: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  points: { fontSize: 15, fontWeight: "900" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 49 },
  empty: { alignItems: "center", paddingVertical: 42, paddingHorizontal: 20 },
  wolf: { width: 165, height: 155 },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  limitNote: { fontSize: 11, textAlign: "center", marginTop: 16 },
});
