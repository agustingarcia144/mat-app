import { Image } from "expo-image";
import { router } from "expo-router";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@repo/convex";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getRewardAvailability,
  getRewardTheme,
  RewardCard,
  sortRewards,
} from "@/components/features/rewards";

const lookingWolf = require("@/assets/images/mat-wolf-looking.png");

function CatalogContent() {
  const isDark = useColorScheme() === "dark";
  const theme = getRewardTheme(isDark);
  const data = useQuery(api.rewards.getMyRewards);

  if (data === undefined) return <LoadingScreen />;
  if (!data?.enabled) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          Programa no disponible
        </Text>
      </View>
    );
  }

  const rewards = sortRewards(data);
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>Beneficios</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>
        Tenés {data.account.balance} {data.settings.pointsName}. Elegí qué
        objetivo querés alcanzar.
      </Text>

      {rewards.length ? (
        <View style={styles.list}>
          {rewards.map((reward) => (
            <RewardCard
              key={reward._id}
              reward={reward}
              availability={getRewardAvailability(reward, data)}
              pointsName={data.settings.pointsName}
              isDark={isDark}
              onPress={() =>
                router.push(
                  `/(tabs)/rewards/reward/${String(reward._id)}` as never,
                )
              }
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Image
            source={lookingWolf}
            style={styles.wolf}
            contentFit="contain"
            accessibilityLabel="Mati buscando beneficios"
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Mati sigue buscando premios
          </Text>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Tu gimnasio todavía no publicó beneficios, pero podés seguir sumando{" "}
            {data.settings.pointsName}.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export default function CatalogScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <CatalogContent />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 104, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { marginTop: 7, fontSize: 14, lineHeight: 20 },
  list: { marginTop: 24, gap: 12 },
  empty: { alignItems: "center", paddingVertical: 45, paddingHorizontal: 16 },
  wolf: { width: 180, height: 160 },
  emptyTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
