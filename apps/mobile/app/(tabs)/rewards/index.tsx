import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Authenticated, AuthLoading, useAction, useQuery } from "convex/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@repo/convex";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  AccessCard,
  CelebrationModal,
  getFeaturedReward,
  getPrimaryProgress,
  getRewardAvailability,
  getRewardTheme,
  ProgressRing,
  REWARD_ACCENT,
  REWARD_AMBER,
  REWARD_BLUE,
  RewardCard,
  rewardDate,
  useMilestoneCelebration,
  useReducedMotionPreference,
} from "@/components/features/rewards";

const progressWolf = require("@/assets/images/mat-wolf-measure.png");

function RewardsContent() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = getRewardTheme(isDark);
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const data = useQuery(api.rewards.getMyRewards);
  const createApplePass = useAction(api.walletActions.createMyAppleWalletPass);
  const createGooglePass = useAction(
    api.walletActions.createMyGoogleWalletPass,
  );
  const [working, setWorking] = useState<string | null>(null);
  const reducedMotion = useReducedMotionPreference();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const { celebration, acknowledge } = useMilestoneCelebration(data, user?.id);

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: 430,
      useNativeDriver: true,
    }).start();
  }, [entrance, reducedMotion]);

  const featuredReward = useMemo(
    () => (data ? getFeaturedReward(data) : undefined),
    [data],
  );
  const primaryProgress = useMemo(
    () => (data ? getPrimaryProgress(data) : null),
    [data],
  );

  if (data === undefined) return <LoadingScreen />;
  if (!data?.enabled) {
    return (
      <View style={[styles.disabled, { backgroundColor: theme.background }]}>
        <EmptyState
          title="Recompensas próximamente"
          description="Tu gimnasio todavía no habilitó su programa. Mati te avisará cuando esté listo."
          imageSize={150}
        />
      </View>
    );
  }

  const ringColor =
    primaryProgress?.accent === "amber"
      ? REWARD_AMBER
      : primaryProgress?.accent === "blue"
        ? REWARD_BLUE
        : REWARD_ACCENT;

  async function addToWallet(provider: "apple" | "google") {
    setWorking(provider);
    try {
      const result =
        provider === "apple"
          ? await createApplePass({})
          : await createGooglePass({});
      await Linking.openURL(result.url);
    } catch (error) {
      Alert.alert(
        "Wallet no configurado",
        error instanceof Error &&
          error.message.includes("CONFIGURATION_REQUIRED")
          ? "El gimnasio todavía debe completar la configuración de Wallet. Podés usar el QR de MAT."
          : "No pudimos abrir Wallet. Intentá nuevamente o usá el QR de MAT.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          }}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.gymRow}>
                {data.organization?.logoUrl ? (
                  <Image
                    source={{ uri: data.organization.logoUrl }}
                    style={styles.logo}
                    contentFit="cover"
                    accessibilityLabel={`Logo de ${data.organization.name}`}
                  />
                ) : null}
                <Text
                  style={[styles.gymName, { color: theme.muted }]}
                  numberOfLines={1}
                >
                  {data.organization?.name}
                </Text>
              </View>
              <Text style={[styles.pageTitle, { color: theme.text }]}>
                {data.settings.programName}
              </Text>
              <Text style={[styles.pageSubtitle, { color: theme.muted }]}>
                Cada visita cuenta. Seguí construyendo tu racha.
              </Text>
            </View>
          </View>

          <LinearGradient
            colors={["#242126", "#111114"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroGlow} />
            <View style={styles.heroMain}>
              <ProgressRing
                progress={primaryProgress?.progress ?? 0}
                value={primaryProgress?.value ?? "0"}
                label={
                  primaryProgress?.kind === "reward" ||
                  primaryProgress?.kind === "balance"
                    ? data.settings.pointsName
                    : undefined
                }
                color={ringColor}
                trackColor="#3F3F46"
                textColor="#FFFFFF"
                reducedMotion={reducedMotion}
              />
              <Image
                source={progressWolf}
                style={styles.heroWolf}
                contentFit="contain"
                accessibilityLabel="Mati acompañando tu progreso"
              />
            </View>
            <Text style={[styles.heroEyebrow, { color: ringColor }]}>
              {primaryProgress?.eyebrow}
            </Text>
            <Text style={styles.heroMessage}>{primaryProgress?.message}</Text>
            <View style={styles.balancePill}>
              <MaterialIcons name="stars" size={16} color="#FBBF24" />
              <Text style={styles.balanceText}>
                {data.account.balance} {data.settings.pointsName} disponibles
              </Text>
            </View>
          </LinearGradient>

          {(data.settings.weeklyBonusEnabled ||
            data.settings.streaksEnabled) && (
            <View style={styles.metrics}>
              {data.settings.weeklyBonusEnabled &&
              data.progress.weeklyTarget ? (
                <MetricCard
                  icon="event-available"
                  color={REWARD_BLUE}
                  background={theme.blueSoft}
                  value={`${data.progress.weeklyAttendances}/${data.progress.weeklyTarget}`}
                  label="Visitas esta semana"
                  textColor={theme.text}
                  mutedColor={theme.muted}
                  borderColor={theme.border}
                />
              ) : null}
              {data.settings.streaksEnabled ? (
                <MetricCard
                  icon="local-fire-department"
                  color={REWARD_AMBER}
                  background={theme.amberSoft}
                  value={`${data.progress.currentStreakDays} días`}
                  label="Racha actual"
                  textColor={theme.text}
                  mutedColor={theme.muted}
                  borderColor={theme.border}
                />
              ) : null}
            </View>
          )}

          <AccessCard
            data={data}
            isDark={isDark}
            working={working}
            onOpenQr={() => router.push("/(tabs)/rewards/qr" as never)}
            onAddWallet={addToWallet}
          />

          <SectionHeader
            title="Beneficios"
            action="Ver todos"
            textColor={theme.text}
            onPress={() => router.push("/(tabs)/rewards/catalog" as never)}
          />
          {featuredReward ? (
            <RewardCard
              reward={featuredReward}
              availability={getRewardAvailability(featuredReward, data)}
              pointsName={data.settings.pointsName}
              isDark={isDark}
              featured
              onPress={() =>
                router.push(
                  `/(tabs)/rewards/reward/${String(featuredReward._id)}` as never,
                )
              }
            />
          ) : (
            <View
              style={[
                styles.inlineEmpty,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <MaterialIcons name="redeem" size={27} color={REWARD_ACCENT} />
              <View style={styles.inlineEmptyCopy}>
                <Text style={[styles.inlineEmptyTitle, { color: theme.text }]}>
                  Muy pronto habrá beneficios
                </Text>
                <Text style={[styles.inlineEmptyText, { color: theme.muted }]}>
                  Mientras tanto, seguí sumando {data.settings.pointsName}.
                </Text>
              </View>
            </View>
          )}

          <SectionHeader
            title="Actividad reciente"
            action="Ver actividad"
            textColor={theme.text}
            onPress={() => router.push("/(tabs)/rewards/activity" as never)}
          />
          <View
            style={[
              styles.activityCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {data.ledger.length ? (
              data.ledger.slice(0, 3).map((entry, index) => (
                <View key={entry._id}>
                  <View style={styles.activityRow}>
                    <View
                      style={[
                        styles.activityIcon,
                        {
                          backgroundColor:
                            entry.points > 0
                              ? theme.greenSoft
                              : theme.orangeSoft,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={entry.points > 0 ? "add" : "remove"}
                        size={18}
                        color={entry.points > 0 ? "#22C55E" : REWARD_ACCENT}
                      />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text
                        style={[styles.activityTitle, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {entry.reason}
                      </Text>
                      <Text
                        style={[styles.activityDate, { color: theme.muted }]}
                      >
                        {rewardDate(entry.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.activityPoints,
                        { color: entry.points > 0 ? "#22C55E" : REWARD_ACCENT },
                      ]}
                    >
                      {entry.points > 0 ? "+" : ""}
                      {entry.points}
                    </Text>
                  </View>
                  {index < Math.min(2, data.ledger.length - 1) ? (
                    <View
                      style={[
                        styles.separator,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[styles.noActivity, { color: theme.muted }]}>
                Tu primera visita aparecerá acá.
              </Text>
            )}
          </View>

          {data.settings.terms ? (
            <Text style={[styles.terms, { color: theme.muted }]}>
              {data.settings.terms}
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>

      <CelebrationModal
        visible={Boolean(celebration)}
        title={celebration?.title ?? ""}
        message={celebration?.message ?? ""}
        detail={celebration?.detail}
        isDark={isDark}
        reducedMotion={reducedMotion}
        onClose={() => void acknowledge()}
      />
    </View>
  );
}

function MetricCard({
  icon,
  color,
  background,
  value,
  label,
  textColor,
  mutedColor,
  borderColor,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  color: string;
  background: string;
  value: string;
  label: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View
      style={[styles.metricCard, { borderColor }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[styles.metricIcon, { backgroundColor: background }]}>
        <MaterialIcons name={icon} size={21} color={color} />
      </View>
      <Text style={[styles.metricValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  action,
  textColor,
  onPress,
}: {
  title: string;
  action: string;
  textColor: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

export default function RewardsScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <RewardsContent />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  disabled: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  headerCopy: { flex: 1 },
  gymRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  logo: { width: 24, height: 24, borderRadius: 8 },
  gymName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pageTitle: {
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 5,
  },
  pageSubtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  hero: { borderRadius: 30, padding: 20, overflow: "hidden", marginBottom: 14 },
  heroGlow: {
    position: "absolute",
    right: -55,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,92,36,0.15)",
  },
  heroMain: {
    minHeight: 142,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroWolf: { width: 145, height: 145, marginRight: -18 },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
    marginTop: 8,
  },
  heroMessage: {
    color: "#E4E4E7",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: 7,
    maxWidth: 310,
  },
  balancePill: {
    alignSelf: "flex-start",
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  balanceText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: 10, marginBottom: 14 },
  metricCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 14,
    minHeight: 126,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { fontSize: 19, fontWeight: "900", marginTop: 10 },
  metricLabel: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 27,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.3 },
  sectionAction: { color: REWARD_ACCENT, fontSize: 13, fontWeight: "800" },
  inlineEmpty: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  inlineEmptyCopy: { flex: 1 },
  inlineEmptyTitle: { fontSize: 15, fontWeight: "800" },
  inlineEmptyText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  activityCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
  },
  activityRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  activityIcon: {
    width: 35,
    height: 35,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1 },
  activityTitle: { fontSize: 14, fontWeight: "700" },
  activityDate: { fontSize: 11, marginTop: 3 },
  activityPoints: { fontSize: 15, fontWeight: "900" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  noActivity: { paddingVertical: 24, textAlign: "center", fontSize: 13 },
  terms: {
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 26,
    paddingHorizontal: 12,
  },
});
