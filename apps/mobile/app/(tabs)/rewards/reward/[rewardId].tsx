import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import {
  Authenticated,
  AuthLoading,
  useMutation,
  useQuery,
} from "convex/react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@repo/convex";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  CelebrationModal,
  getRewardAvailability,
  getRewardTheme,
  REWARD_ACCENT,
  REWARD_SUCCESS,
  useReducedMotionPreference,
} from "@/components/features/rewards";

const lookingWolf = require("@/assets/images/mat-wolf-looking.png");

function RewardDetailContent() {
  const { rewardId } = useLocalSearchParams<{ rewardId: string }>();
  const isDark = useColorScheme() === "dark";
  const theme = getRewardTheme(isDark);
  const reducedMotion = useReducedMotionPreference();
  const data = useQuery(api.rewards.getMyRewards);
  const redeem = useMutation(api.rewards.redeem);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    detail: string;
  } | null>(null);

  const reward = useMemo(
    () => data?.rewards.find((item) => String(item._id) === rewardId),
    [data?.rewards, rewardId],
  );

  if (data === undefined) return <LoadingScreen />;
  if (!data?.enabled || !reward) {
    return (
      <View style={[styles.unavailable, { backgroundColor: theme.background }]}>
        <Image
          source={lookingWolf}
          style={styles.unavailableWolf}
          contentFit="contain"
          accessibilityLabel="Mati buscando el beneficio"
        />
        <Text style={[styles.unavailableTitle, { color: theme.text }]}>
          Este beneficio ya no está disponible
        </Text>
        <Text style={[styles.unavailableText, { color: theme.muted }]}>
          Puede haberse agotado o retirado del catálogo.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>Volver al catálogo</Text>
        </Pressable>
      </View>
    );
  }

  const availability = getRewardAvailability(reward, data);
  const statusColor = availability.canRedeem
    ? REWARD_SUCCESS
    : availability.tone === "soldOut"
      ? theme.muted
      : REWARD_ACCENT;

  async function confirmRedemption() {
    setWorking(true);
    setError(null);
    try {
      await redeem({ rewardDefinitionId: reward!._id });
      setConfirming(false);
      setSuccess({
        message: `Canjeaste ${reward!.name}. Te quedan ${Math.max(0, data!.account.balance - reward!.pointsCost)} ${data!.settings.pointsName}.`,
        detail:
          reward!.fulfillmentInstructions ??
          "Mostrá la solicitud en recepción para coordinar la entrega.",
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Intentá nuevamente.";
      if (message.includes("límite")) {
        setError("Ya alcanzaste el límite de canjes para este beneficio.");
      } else if (message.includes("stock")) {
        setError(
          "El beneficio se quedó sin stock antes de confirmar el canje.",
        );
      } else if (message.includes("saldo")) {
        setError("Tu saldo cambió y ya no alcanza para completar este canje.");
      } else if (message.includes("no está disponible")) {
        setError("Este beneficio ya no está disponible.");
      } else {
        setError(
          "No pudimos completar el canje. Revisá tu conexión e intentá nuevamente.",
        );
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {reward.imageUrl ? (
          <Image
            source={{ uri: reward.imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            accessibilityLabel={`Imagen de ${reward.name}`}
          />
        ) : (
          <LinearGradient
            colors={isDark ? ["#3A211A", "#202024"] : ["#FFF0EA", "#FFF8F5"]}
            style={[styles.heroImage, styles.fallback]}
          >
            <MaterialIcons name="redeem" size={74} color={REWARD_ACCENT} />
          </LinearGradient>
        )}

        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: theme.text }]}>
              {reward.name}
            </Text>
            <Text style={[styles.cost, { color: REWARD_ACCENT }]}>
              {reward.pointsCost} {data.settings.pointsName}
            </Text>
          </View>
          <View
            style={[styles.status, { backgroundColor: `${statusColor}1F` }]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {availability.label}
            </Text>
          </View>
        </View>

        {reward.description ? (
          <Text style={[styles.description, { color: theme.muted }]}>
            {reward.description}
          </Text>
        ) : null}

        <View
          style={[
            styles.balanceCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.balanceIcon, { backgroundColor: theme.orangeSoft }]}
          >
            <MaterialIcons name="stars" size={23} color={REWARD_ACCENT} />
          </View>
          <View style={styles.balanceCopy}>
            <Text style={[styles.balanceLabel, { color: theme.muted }]}>
              Tu saldo
            </Text>
            <Text style={[styles.balanceValue, { color: theme.text }]}>
              {data.account.balance} {data.settings.pointsName}
            </Text>
          </View>
          {!availability.canRedeem && availability.missingPoints > 0 ? (
            <Text style={[styles.missing, { color: REWARD_ACCENT }]}>
              Faltan {availability.missingPoints}
            </Text>
          ) : null}
        </View>

        {reward.fulfillmentInstructions ? (
          <View style={[styles.infoCard, { backgroundColor: theme.blueSoft }]}>
            <MaterialIcons name="info-outline" size={21} color="#38BDF8" />
            <View style={styles.infoCopy}>
              <Text style={[styles.infoTitle, { color: theme.text }]}>
                Cómo recibirlo
              </Text>
              <Text style={[styles.infoText, { color: theme.muted }]}>
                {reward.fulfillmentInstructions}
              </Text>
            </View>
          </View>
        ) : null}

        {availability.reason ? (
          <View
            style={[
              styles.reasonCard,
              {
                backgroundColor:
                  availability.tone === "soldOut"
                    ? theme.surface
                    : theme.orangeSoft,
              },
            ]}
          >
            <MaterialIcons
              name={
                availability.tone === "soldOut" ? "inventory-2" : "lock-outline"
              }
              size={19}
              color={statusColor}
            />
            <Text style={[styles.reasonText, { color: theme.text }]}>
              {availability.reason}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[styles.errorCard, { backgroundColor: theme.dangerSoft }]}
            accessibilityRole="alert"
          >
            <MaterialIcons name="error-outline" size={19} color="#EF4444" />
            <Text
              style={[
                styles.errorText,
                { color: isDark ? "#FCA5A5" : "#B91C1C" },
              ]}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {confirming ? (
          <View
            style={[
              styles.confirmCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.confirmTitle, { color: theme.text }]}>
              Confirmá tu canje
            </Text>
            <Text style={[styles.confirmText, { color: theme.muted }]}>
              Se descontarán {reward.pointsCost} {data.settings.pointsName}. El
              gimnasio confirmará la entrega.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                disabled={working}
                onPress={() => setConfirming(false)}
                style={[styles.cancelButton, { borderColor: theme.border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.cancelText, { color: theme.text }]}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                disabled={working}
                onPress={() => void confirmRedemption()}
                style={styles.confirmButton}
                accessibilityRole="button"
                accessibilityState={{ disabled: working }}
              >
                {working ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Sí, canjear</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            disabled={!availability.canRedeem}
            onPress={() => {
              setError(null);
              setConfirming(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Canjear ${reward.name}`}
            accessibilityState={{ disabled: !availability.canRedeem }}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: availability.canRedeem
                  ? REWARD_ACCENT
                  : theme.track,
              },
              pressed && availability.canRedeem && styles.pressed,
            ]}
          >
            <Text style={styles.ctaText}>
              {availability.canRedeem
                ? "Canjear beneficio"
                : availability.label}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <CelebrationModal
        visible={Boolean(success)}
        title="Canje solicitado"
        message={success?.message ?? ""}
        detail={success?.detail}
        isDark={isDark}
        reducedMotion={reducedMotion}
        onClose={() => setSuccess(null)}
      />
    </View>
  );
}

export default function RewardDetailScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <RewardDetailContent />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 94, paddingBottom: 52 },
  heroImage: { width: "100%", aspectRatio: 1.35, borderRadius: 28 },
  fallback: { alignItems: "center", justifyContent: "center" },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 22,
  },
  headingCopy: { flex: 1 },
  title: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  cost: { fontSize: 17, fontWeight: "900", marginTop: 7 },
  status: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 3,
  },
  statusText: { fontSize: 11, fontWeight: "900" },
  description: { fontSize: 15, lineHeight: 22, marginTop: 17 },
  balanceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 15,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  balanceIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceCopy: { flex: 1 },
  balanceLabel: { fontSize: 11, fontWeight: "700" },
  balanceValue: { fontSize: 17, fontWeight: "900", marginTop: 2 },
  missing: { fontSize: 12, fontWeight: "900" },
  infoCard: {
    borderRadius: 18,
    padding: 15,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: "900" },
  infoText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  reasonCard: {
    borderRadius: 18,
    padding: 14,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  reasonText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  errorCard: {
    borderRadius: 18,
    padding: 14,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  cta: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  ctaText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  confirmCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 17,
    marginTop: 24,
  },
  confirmTitle: { fontSize: 17, fontWeight: "900" },
  confirmText: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "800" },
  confirmButton: {
    flex: 1.25,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: REWARD_ACCENT,
  },
  confirmButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  unavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  unavailableWolf: { width: 180, height: 160 },
  unavailableTitle: {
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 10,
  },
  unavailableText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  backButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: REWARD_ACCENT,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  backButtonText: { color: "#FFFFFF", fontWeight: "900" },
});
