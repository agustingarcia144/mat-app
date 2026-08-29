import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  Authenticated,
  AuthLoading,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { router } from "expo-router";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { api } from "@repo/convex";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { Colors } from "@/constants/theme";

const REDEMPTION_STATUS_LABELS = {
  requested: "Solicitado",
  ready: "Listo para retirar",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
} as const;

function RewardsContent() {
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = Colors[colorScheme];
  const rewards = useQuery(api.rewards.getMyRewards);
  const redeem = useMutation(api.rewards.redeem);
  const createApplePass = useAction(api.walletActions.createMyAppleWalletPass);
  const createGooglePass = useAction(
    api.walletActions.createMyGoogleWalletPass,
  );
  const [working, setWorking] = useState<string | null>(null);

  const rewardById = useMemo(
    () =>
      new Map(rewards?.rewards.map((item) => [String(item._id), item]) ?? []),
    [rewards?.rewards],
  );

  if (rewards === undefined) return <LoadingScreen />;
  if (!rewards?.enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialIcons name="redeem" size={56} color={colors.icon} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Recompensas próximamente
        </Text>
        <Text style={[styles.emptyText, { color: colors.icon }]}>
          Tu gimnasio todavía no habilitó su programa.
        </Text>
      </View>
    );
  }
  const nextReward = [...rewards.rewards]
    .filter((item) => item.pointsCost > rewards.account.balance)
    .sort((a, b) => a.pointsCost - b.pointsCost)[0];

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

  function confirmRedemption(
    id: NonNullable<typeof rewards>["rewards"][number]["_id"],
    name: string,
    cost: number,
  ) {
    Alert.alert(
      `Canjear ${name}`,
      `Se descontarán ${cost} ${rewards!.settings.pointsName}. El gimnasio confirmará la entrega.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Canjear",
          onPress: async () => {
            setWorking(String(id));
            try {
              await redeem({ rewardDefinitionId: id });
              Alert.alert(
                "Canje solicitado",
                "Mostrá la solicitud en recepción para coordinar la entrega.",
              );
            } catch (error) {
              Alert.alert(
                "No se pudo canjear",
                error instanceof Error ? error.message : "Intentá nuevamente.",
              );
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View>
        <Text style={[styles.eyebrow, { color: colors.icon }]}>
          {rewards.organization?.name}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {rewards.settings.programName}
        </Text>
      </View>

      <View
        style={[
          styles.balanceCard,
          { backgroundColor: colorScheme === "dark" ? "#18181b" : "#111827" },
        ]}
      >
        <Text style={styles.balanceLabel}>TU SALDO</Text>
        <Text style={styles.balance}>{rewards.account.balance}</Text>
        <Text style={styles.balanceUnit}>{rewards.settings.pointsName}</Text>
        {nextReward && (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.round(
                        (rewards.account.balance / nextReward.pointsCost) * 100,
                      ),
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              Te faltan {nextReward.pointsCost - rewards.account.balance} para{" "}
              {nextReward.name}
            </Text>
          </View>
        )}
        <Pressable
          style={[
            styles.qrButton,
            !rewards.access.allowed && styles.qrButtonDisabled,
          ]}
          disabled={!rewards.access.allowed}
          onPress={() => router.push("/(tabs)/rewards/qr" as never)}
        >
          <MaterialIcons name="qr-code-2" size={22} color="#111827" />
          <Text style={styles.qrButtonText}>
            {rewards.access.allowed
              ? "Mostrar QR de ingreso"
              : "Ingreso no disponible"}
          </Text>
        </Pressable>
        {!rewards.access.allowed && (
          <Text style={styles.accessWarning}>
            Tu membresía o plan requiere atención. Contactá al gimnasio antes de
            ingresar.
          </Text>
        )}
      </View>

      <View style={styles.walletRow}>
        {Platform.OS === "ios" && rewards.wallet.appleConfigured && (
          <Pressable
            style={[styles.walletButton, { borderColor: colors.icon }]}
            onPress={() => addToWallet("apple")}
            disabled={working !== null}
          >
            {working === "apple" ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <MaterialIcons name="wallet" size={20} color={colors.text} />
            )}
            <Text style={[styles.walletText, { color: colors.text }]}>
              Apple Wallet
            </Text>
          </Pressable>
        )}
        {Platform.OS === "android" && rewards.wallet.googleConfigured && (
          <Pressable
            style={[styles.walletButton, { borderColor: colors.icon }]}
            onPress={() => addToWallet("google")}
            disabled={working !== null}
          >
            {working === "google" ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <MaterialIcons name="wallet" size={20} color={colors.text} />
            )}
            <Text style={[styles.walletText, { color: colors.text }]}>
              Google Wallet
            </Text>
          </Pressable>
        )}
      </View>

      {(rewards.settings.streaksEnabled ||
        rewards.settings.weeklyBonusEnabled) && (
        <View style={styles.milestoneRow}>
          {rewards.settings.streaksEnabled && (
            <View
              style={[
                styles.milestoneCard,
                {
                  borderColor: colorScheme === "dark" ? "#27272a" : "#e5e7eb",
                },
              ]}
            >
              <MaterialIcons
                name="local-fire-department"
                size={24}
                color="#f97316"
              />
              <Text style={[styles.milestoneValue, { color: colors.text }]}>
                {rewards.progress.currentStreakDays} días
              </Text>
              <Text style={[styles.milestoneLabel, { color: colors.icon }]}>
                Racha actual
              </Text>
            </View>
          )}
          {rewards.settings.weeklyBonusEnabled && (
            <View
              style={[
                styles.milestoneCard,
                {
                  borderColor: colorScheme === "dark" ? "#27272a" : "#e5e7eb",
                },
              ]}
            >
              <MaterialIcons name="event-available" size={24} color="#16a34a" />
              <Text style={[styles.milestoneValue, { color: colors.text }]}>
                {rewards.progress.weeklyAttendances}/
                {rewards.progress.weeklyTarget}
              </Text>
              <Text style={[styles.milestoneLabel, { color: colors.icon }]}>
                Meta semanal
              </Text>
            </View>
          )}
        </View>
      )}

      <SectionTitle title="Beneficios disponibles" color={colors.text} />
      {rewards.rewards.length === 0 ? (
        <Text style={[styles.muted, { color: colors.icon }]}>
          El gimnasio todavía no publicó beneficios.
        </Text>
      ) : (
        rewards.rewards.map((item) => {
          const affordable = rewards.account.balance >= item.pointsCost;
          const inStock =
            item.availableQuantity === undefined || item.availableQuantity > 0;
          return (
            <View
              key={item._id}
              style={[
                styles.card,
                { borderColor: colorScheme === "dark" ? "#27272a" : "#e5e7eb" },
              ]}
            >
              {!!item.imageUrl && (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.rewardImage}
                  contentFit="cover"
                  transition={150}
                />
              )}
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {item.name}
                </Text>
                {!!item.description && (
                  <Text style={[styles.muted, { color: colors.icon }]}>
                    {item.description}
                  </Text>
                )}
                <Text style={[styles.cost, { color: colors.text }]}>
                  {item.pointsCost} {rewards.settings.pointsName}
                </Text>
                {!inStock && (
                  <Text style={[styles.muted, { color: colors.icon }]}>
                    Sin stock por el momento
                  </Text>
                )}
              </View>
              <Pressable
                style={[
                  styles.smallButton,
                  (!affordable || !inStock) && styles.disabledButton,
                ]}
                disabled={!affordable || !inStock || working !== null}
                onPress={() =>
                  confirmRedemption(item._id, item.name, item.pointsCost)
                }
              >
                {working === String(item._id) ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.smallButtonText}>
                    {inStock ? "Canjear" : "Agotado"}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })
      )}

      <SectionTitle title="Actividad reciente" color={colors.text} />
      {rewards.ledger.slice(0, 8).map((entry) => (
        <View key={entry._id} style={styles.historyRow}>
          <View
            style={[
              styles.historyIcon,
              { backgroundColor: entry.points > 0 ? "#dcfce7" : "#fee2e2" },
            ]}
          >
            <MaterialIcons
              name={entry.points > 0 ? "add" : "remove"}
              size={18}
              color={entry.points > 0 ? "#166534" : "#991b1b"}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>
              {entry.reason}
            </Text>
            <Text style={[styles.historyDate, { color: colors.icon }]}>
              {new Date(entry.createdAt).toLocaleDateString("es-AR")}
            </Text>
          </View>
          <Text
            style={[
              styles.historyPoints,
              { color: entry.points > 0 ? "#16a34a" : "#dc2626" },
            ]}
          >
            {entry.points > 0 ? "+" : ""}
            {entry.points}
          </Text>
        </View>
      ))}

      {rewards.redemptions.length > 0 && (
        <>
          <SectionTitle title="Mis canjes" color={colors.text} />
          {rewards.redemptions.map((item) => (
            <View key={item._id} style={styles.historyRow}>
              <View style={styles.cardText}>
                <Text style={[styles.historyTitle, { color: colors.text }]}>
                  {rewardById.get(String(item.rewardDefinitionId))?.name ??
                    "Recompensa"}
                </Text>
                <Text style={[styles.historyDate, { color: colors.icon }]}>
                  {REDEMPTION_STATUS_LABELS[item.status]}
                </Text>
              </View>
              <Text style={[styles.historyPoints, { color: colors.icon }]}>
                -{item.pointsCost}
              </Text>
            </View>
          ))}
        </>
      )}

      {!!rewards.settings.terms && (
        <Text style={[styles.terms, { color: colors.icon }]}>
          {rewards.settings.terms}
        </Text>
      )}
    </ScrollView>
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

function SectionTitle({ title, color }: { title: string; color: string }) {
  return <Text style={[styles.sectionTitle, { color }]}>{title}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 70, paddingBottom: 48, gap: 16 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: { marginTop: 16, fontSize: 22, fontWeight: "700" },
  emptyText: { marginTop: 6, textAlign: "center" },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: { marginTop: 4, fontSize: 30, fontWeight: "800" },
  balanceCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  balanceLabel: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  balance: { color: "#fff", fontSize: 58, fontWeight: "800", marginTop: 4 },
  balanceUnit: { color: "#d1d5db", fontSize: 16 },
  progressBlock: { width: "100%", marginTop: 16, gap: 7 },
  progressTrack: {
    height: 7,
    borderRadius: 99,
    backgroundColor: "#374151",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: "#fff" },
  progressText: { color: "#d1d5db", fontSize: 12, textAlign: "center" },
  qrButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  qrButtonText: { color: "#111827", fontWeight: "700" },
  qrButtonDisabled: { opacity: 0.55 },
  accessWarning: {
    color: "#fca5a5",
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  walletRow: { flexDirection: "row", gap: 12 },
  walletButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  walletText: { fontWeight: "600" },
  milestoneRow: { flexDirection: "row", gap: 12 },
  milestoneCard: {
    flex: 1,
    minHeight: 112,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
  },
  milestoneValue: { marginTop: 6, fontSize: 20, fontWeight: "800" },
  milestoneLabel: { marginTop: 2, fontSize: 12 },
  sectionTitle: { marginTop: 8, fontSize: 20, fontWeight: "700" },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardText: { flex: 1, gap: 3 },
  rewardImage: { width: 64, height: 64, borderRadius: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  muted: { fontSize: 14, lineHeight: 20 },
  cost: { marginTop: 5, fontWeight: "700" },
  smallButton: {
    minWidth: 82,
    borderRadius: 10,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  disabledButton: { opacity: 0.35 },
  smallButtonText: { color: "#fff", fontWeight: "700" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 7,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTitle: { fontWeight: "600" },
  historyDate: { fontSize: 12 },
  historyPoints: { fontSize: 16, fontWeight: "700" },
  terms: { marginTop: 16, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
