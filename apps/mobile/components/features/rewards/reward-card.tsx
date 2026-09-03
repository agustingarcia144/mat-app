import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RewardAvailability, RewardDefinition } from "./model";
import { REWARD_ACCENT, REWARD_SUCCESS, getRewardTheme } from "./reward-theme";

type Props = {
  reward: RewardDefinition;
  availability: RewardAvailability;
  pointsName: string;
  isDark: boolean;
  onPress: () => void;
  featured?: boolean;
};

export function RewardCard({
  reward,
  availability,
  pointsName,
  isDark,
  onPress,
  featured = false,
}: Props) {
  const theme = getRewardTheme(isDark);
  const statusColor =
    availability.tone === "available"
      ? REWARD_SUCCESS
      : availability.tone === "soldOut"
        ? theme.muted
        : REWARD_ACCENT;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${reward.name}, ${reward.pointsCost} ${pointsName}, ${availability.label}`}
      style={({ pressed }) => [
        styles.card,
        featured && styles.featuredCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      {reward.imageUrl ? (
        <Image
          source={{ uri: reward.imageUrl }}
          style={[styles.image, featured && styles.featuredImage]}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Imagen de ${reward.name}`}
        />
      ) : (
        <LinearGradient
          colors={isDark ? ["#3A211A", "#202024"] : ["#FFF0EA", "#FFF8F5"]}
          style={[
            styles.image,
            styles.fallback,
            featured && styles.featuredImage,
          ]}
        >
          <MaterialIcons
            name="redeem"
            size={featured ? 38 : 30}
            color={REWARD_ACCENT}
          />
        </LinearGradient>
      )}
      <View style={styles.body}>
        {featured ? (
          <Text style={[styles.eyebrow, { color: REWARD_ACCENT }]}>
            DESTACADO
          </Text>
        ) : null}
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {reward.name}
        </Text>
        {reward.description ? (
          <Text
            style={[styles.description, { color: theme.muted }]}
            numberOfLines={2}
          >
            {reward.description}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={[styles.cost, { color: theme.text }]}>
            {reward.pointsCost} {pointsName}
          </Text>
          <View
            style={[styles.status, { backgroundColor: `${statusColor}1F` }]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {availability.label}
            </Text>
          </View>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.subtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  featuredCard: { minHeight: 136, padding: 14 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  image: { width: 82, height: 88, borderRadius: 17 },
  featuredImage: { width: 100, height: 106 },
  fallback: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 17, fontWeight: "800", lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 18 },
  footer: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cost: { fontSize: 14, fontWeight: "800" },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "800" },
});
