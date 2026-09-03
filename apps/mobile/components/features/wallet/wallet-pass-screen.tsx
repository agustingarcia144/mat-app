import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { api } from "@repo/convex";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import React, { useCallback, useState } from "react";
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
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "expo-router";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type WalletProvider = "apple" | "google";

type WalletPreview = NonNullable<
  FunctionReturnType<typeof api.rewards.getMyWalletPassPreview>
>;

/**
 * Minimum iOS major version that renders the `posterGeneric` (full-art) pass
 * layout — Apple ships it in iOS 27. On iOS 26 and earlier Wallet falls back to
 * the classic `generic` layout, so the in-app preview must match — see
 * `posterGeneric`/`generic` in `packages/convex/convex/walletActions.ts`.
 */
const POSTER_PASS_MIN_IOS_MAJOR = 27;

function supportsPosterPass() {
  if (Platform.OS !== "ios") return false;
  const major = Number.parseInt(String(Platform.Version), 10);
  return Number.isNaN(major) ? true : major >= POSTER_PASS_MIN_IOS_MAJOR;
}

type WalletPassScreenProps = {
  onboarding?: boolean;
  onDone?: () => void;
};

function formatExpiration(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function WalletPassScreen({
  onboarding = false,
  onDone,
}: WalletPassScreenProps) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = Colors[colorScheme];
  const preview = useQuery(api.rewards.getMyWalletPassPreview);
  const createApplePass = useAction(api.walletActions.createMyAppleWalletPass);
  const createGooglePass = useAction(
    api.walletActions.createMyGoogleWalletPass,
  );
  const [working, setWorking] = useState(false);
  const navigation = useNavigation();

  const provider: WalletProvider = Platform.OS === "ios" ? "apple" : "google";
  const providerName = provider === "apple" ? "Apple Wallet" : "Google Wallet";
  const providerConfigured = preview?.providers[provider] ?? false;
  const canAdd = Boolean(preview?.available && providerConfigured);
  const foreground = preview?.design.foregroundColor ?? "#FFFFFF";
  const labelColor = preview?.design.labelColor ?? "#BEC8DC";
  const addToWallet = useCallback(async () => {
    if (!canAdd || working) return;
    setWorking(true);
    try {
      const result =
        provider === "apple"
          ? await createApplePass({})
          : await createGooglePass({});
      await Linking.openURL(result.url);
    } catch (error) {
      Alert.alert(
        "No pudimos abrir Wallet",
        error instanceof Error &&
          error.message.includes("CONFIGURATION_REQUIRED")
          ? "Tu gimnasio todavía debe completar la configuración de Wallet."
          : "Revisá tu conexión e intentá nuevamente.",
      );
    } finally {
      setWorking(false);
    }
  }, [canAdd, createApplePass, createGooglePass, provider, working]);

  React.useEffect(() => {
    if (onboarding || preview === undefined) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={addToWallet}
          disabled={!canAdd || working}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: !canAdd || working ? 0.4 : pressed ? 0.55 : 1,
            paddingHorizontal: 4,
          })}
          accessibilityRole="button"
          accessibilityLabel={`Agregar a ${providerName}`}
        >
          {working ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text
              style={[
                styles.headerAction,
                { color: colorScheme === "dark" ? "#FFFFFF" : "#000000" },
              ]}
            >
              Agregar
            </Text>
          )}
        </Pressable>
      ),
    });
    return () => navigation.setOptions({ headerRight: undefined });
  }, [
    addToWallet,
    canAdd,
    navigation,
    onboarding,
    preview,
    providerName,
    working,
    colorScheme,
  ]);

  if (preview === undefined) return <LoadingScreen />;

  // Google Wallet always renders the full-art card; on iOS it depends on the
  // OS version, since older releases fall back to the classic pass layout.
  const usesPosterLayout = provider === "google" || supportsPosterPass();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: onboarding
            ? Math.max(insets.top + 24, 44)
            : headerHeight + 20,
          paddingBottom: Math.max(insets.bottom + 28, 44),
        },
      ]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        {onboarding ? (
          <View style={styles.stepBadge}>
            <MaterialIcons name="wallet" size={20} color="#216ACF" />
          </View>
        ) : null}
        <Text style={[styles.title, { color: colors.text }]}>
          Tu pase, siempre a mano
        </Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          Agregá tu credencial de {preview.organizationName} a {providerName}{" "}
          para acceder rápidamente desde tu teléfono.
        </Text>
      </View>

      {usesPosterLayout ? (
        <PosterPass
          preview={preview}
          provider={provider}
          foreground={foreground}
          labelColor={labelColor}
        />
      ) : (
        <GenericPass
          preview={preview}
          provider={provider}
          foreground={foreground}
          labelColor={labelColor}
        />
      )}

      <Text style={[styles.previewNote, { color: colors.icon }]}>
        Vista previa de tu credencial
      </Text>

      {onboarding ? (
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colorScheme === "dark" ? "#FFFFFF" : "#111111" },
            (!canAdd || working) && styles.disabledButton,
            pressed && canAdd && !working && styles.pressedButton,
          ]}
          onPress={addToWallet}
          disabled={!canAdd || working}
          accessibilityRole="button"
          accessibilityLabel={`Agregar a ${providerName}`}
        >
          {working ? (
            <ActivityIndicator
              color={colorScheme === "dark" ? "#000" : "#fff"}
            />
          ) : (
            <>
              <MaterialIcons
                name="wallet"
                size={22}
                color={colorScheme === "dark" ? "#000" : "#fff"}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colorScheme === "dark" ? "#000" : "#fff" },
                ]}
              >
                Agregar a {providerName}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      {!canAdd ? (
        <Text style={[styles.unavailable, { color: colors.icon }]}>
          {!preview.available
            ? "Tu gimnasio todavía no habilitó la credencial Wallet."
            : `${providerName} todavía no está configurado para tu gimnasio.`}
        </Text>
      ) : (
        <Text style={[styles.help, { color: colors.icon }]}>
          La credencial se actualizará automáticamente cuando cambie tu
          membresía o tu saldo.
        </Text>
      )}

      {onboarding && onDone ? (
        <Pressable
          style={({ pressed }) => [
            styles.doneButton,
            pressed && styles.pressedButton,
          ]}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={[styles.doneButtonText, { color: colors.text }]}>
            Finalizar
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PosterPass({
  preview,
  provider,
  foreground,
  labelColor,
}: {
  preview: WalletPreview;
  provider: WalletProvider;
  foreground: string;
  labelColor: string;
}) {
  const hasImageBackground =
    preview.design.backgroundStyle === "image" &&
    Boolean(preview.design.heroImageUrl);
  const hasGradient = preview.design.backgroundStyle === "gradient";

  return (
    <View
      style={[styles.pass, { backgroundColor: preview.design.backgroundColor }]}
    >
      {hasGradient ? (
        <LinearGradient
          colors={[
            preview.design.gradientStartColor ?? preview.design.backgroundColor,
            preview.design.gradientEndColor ?? "#216ACF",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {hasImageBackground ? (
        <>
          <Image
            source={{ uri: preview.design.heroImageUrl! }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Diseño de la credencial"
          />
          <View style={[StyleSheet.absoluteFill, styles.imageScrim]} />
        </>
      ) : null}

      <View style={styles.passHeader}>
        <PassBrand
          preview={preview}
          provider={provider}
          foreground={foreground}
        />
        <PassValue
          label="MEMBRESÍA"
          value={preview.membershipStatus}
          labelColor={labelColor}
          valueColor={foreground}
          align="right"
        />
      </View>

      <View style={styles.passSpacer} />

      <View
        style={styles.qrFrame}
        accessibilityLabel="Vista previa del código QR"
      >
        <QRCode value="MAT:WALLET:PREVIEW" size={112} ecl="M" />
      </View>

      <View style={styles.passFooter}>
        <View style={styles.footerRow}>
          <PassValue
            label="SOCIO"
            value={preview.memberName}
            labelColor="rgba(255,255,255,0.68)"
            valueColor="#FFFFFF"
          />
          <PassValue
            label="VENCE"
            value={formatExpiration(preview.membershipExpiresAt)}
            labelColor="rgba(255,255,255,0.68)"
            valueColor="#FFFFFF"
            align="right"
          />
        </View>
        {(preview.design.showPoints ?? true) ? (
          <PassValue
            label={preview.pointsName.toUpperCase()}
            value={String(preview.balance)}
            labelColor="rgba(255,255,255,0.68)"
            valueColor="#FFFFFF"
            align="right"
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Classic Wallet layout (pre-`posterGeneric` iOS): solid/gradient background,
 * no hero art, fields stacked above a white barcode strip. Mirrors
 * `genericFallbackFields` in `walletActions.ts`.
 */
function GenericPass({
  preview,
  provider,
  foreground,
  labelColor,
}: {
  preview: WalletPreview;
  provider: WalletProvider;
  foreground: string;
  labelColor: string;
}) {
  const hasGradient = preview.design.backgroundStyle === "gradient";

  return (
    <View
      style={[
        styles.pass,
        styles.genericPass,
        { backgroundColor: preview.design.backgroundColor },
      ]}
    >
      {hasGradient ? (
        <LinearGradient
          colors={[
            preview.design.gradientStartColor ?? preview.design.backgroundColor,
            preview.design.gradientEndColor ?? "#216ACF",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View style={styles.genericBody}>
        <View style={styles.passHeader}>
          <PassBrand
            preview={preview}
            provider={provider}
            foreground={foreground}
          />
        </View>

        <View style={styles.genericPrimary}>
          <PassValue
            label="SOCIO"
            value={preview.memberName}
            labelColor={labelColor}
            valueColor={foreground}
          />
        </View>

        <View style={styles.genericSecondaryRow}>
          <PassValue
            label="MEMBRESÍA"
            value={preview.membershipStatus}
            labelColor={labelColor}
            valueColor={foreground}
          />
          <PassValue
            label="VENCE"
            value={formatExpiration(preview.membershipExpiresAt)}
            labelColor={labelColor}
            valueColor={foreground}
          />
          {(preview.design.showPoints ?? true) ? (
            <PassValue
              label={preview.pointsName.toUpperCase()}
              value={String(preview.balance)}
              labelColor={labelColor}
              valueColor={foreground}
            />
          ) : null}
        </View>
      </View>

      <View
        style={styles.genericStrip}
        accessibilityLabel="Vista previa del código QR"
      >
        <QRCode value="MAT:WALLET:PREVIEW" size={112} ecl="M" />
      </View>
    </View>
  );
}

function PassBrand({
  preview,
  provider,
  foreground,
}: {
  preview: WalletPreview;
  provider: WalletProvider;
  foreground: string;
}) {
  return (
    <View style={styles.brand}>
      {preview.design.logoUrl ? (
        <Image
          source={{ uri: preview.design.logoUrl }}
          style={styles.logo}
          contentFit="contain"
          contentPosition="left"
          accessibilityLabel={`Logo de ${preview.organizationName}`}
        />
      ) : (
        <MaterialIcons name="fitness-center" size={25} color={foreground} />
      )}
      <Text style={[styles.brandName, { color: foreground }]} numberOfLines={1}>
        {provider === "apple"
          ? preview.design.logoText || preview.organizationName
          : preview.design.googleProgramName || preview.organizationName}
      </Text>
    </View>
  );
}

function PassValue({
  label,
  value,
  labelColor,
  valueColor,
  align = "left",
}: {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
  align?: "left" | "right";
}) {
  return (
    <View
      style={[styles.passValue, align === "right" && styles.passValueRight]}
    >
      <Text style={[styles.passLabel, { color: labelColor, textAlign: align }]}>
        {label}
      </Text>
      <Text
        style={[styles.passValueText, { color: valueColor, textAlign: align }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerAction: { fontSize: 16, fontWeight: "600" },
  content: { paddingHorizontal: 24, alignItems: "center" },
  heading: { width: "100%", alignItems: "center", marginBottom: 28 },
  stepBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE",
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 390,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  pass: {
    width: "100%",
    maxWidth: 360,
    minHeight: 470,
    overflow: "hidden",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  genericPass: { minHeight: 0, justifyContent: "space-between" },
  genericBody: { paddingBottom: 24 },
  genericPrimary: { paddingHorizontal: 20, paddingTop: 26 },
  genericSecondaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  genericStrip: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
  },
  imageScrim: { backgroundColor: "rgba(0,0,0,0.22)" },
  passHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  brand: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  logo: { width: 42, height: 30 },
  brandName: { flex: 1, fontSize: 14, fontWeight: "700" },
  passSpacer: { flex: 1, minHeight: 185 },
  qrFrame: {
    zIndex: 2,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 10,
    marginBottom: -22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  passFooter: {
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.48)",
    paddingHorizontal: 20,
    paddingTop: 38,
    paddingBottom: 20,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 20 },
  passValue: { minWidth: 0, flexShrink: 1 },
  passValueRight: { alignItems: "flex-end" },
  passLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  passValueText: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  previewNote: { marginTop: 16, fontSize: 12 },
  primaryButton: {
    width: "100%",
    maxWidth: 420,
    minHeight: 54,
    marginTop: 28,
    paddingHorizontal: 20,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: { fontSize: 16, fontWeight: "700" },
  disabledButton: { opacity: 0.42 },
  pressedButton: { opacity: 0.72 },
  help: {
    maxWidth: 420,
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  unavailable: {
    maxWidth: 420,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  doneButton: {
    minHeight: 48,
    paddingHorizontal: 28,
    justifyContent: "center",
    marginTop: 12,
  },
  doneButtonText: { fontSize: 16, fontWeight: "700" },
});
