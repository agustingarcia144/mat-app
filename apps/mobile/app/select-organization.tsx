import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { useClerk } from "@clerk/expo";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type ScanningResult,
} from "expo-camera";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useAppReset } from "@/components/providers/providers";
import { usePendingJoin } from "@/contexts/pending-join-context";
import { parseJoinTokenFromUrl } from "@/lib/pending-join";
import { captureHandledError } from "@/lib/sentry";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  trainer: "Entrenador",
  member: "Miembro",
};

export default function SelectOrganizationScreen() {
  const { isAuthenticated } = useConvexAuth();
  const organizations = useQuery(
    api.organizationMemberships.getMyOrganizations,
    isAuthenticated ? {} : "skip",
  );
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    isAuthenticated ? {} : "skip",
  );
  const pendingJoinRequests = useQuery(
    api.joinGym.getMyPendingJoinRequests,
    isAuthenticated ? {} : "skip",
  );
  const router = useRouter();
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization,
  );
  const redeemMemberInviteCode = useAction(
    api.memberInviteCodes.redeemMemberInviteCode,
  );
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { resetApp } = useAppReset();
  const { signOut } = useClerk();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [hasScannedQr, setHasScannedQr] = useState(false);
  const [lastSelectedOrgId, setLastSelectedOrgId] = useState<string | null>(
    null,
  );
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { setPendingToken } = usePendingJoin();
  const hasAttemptedAutoSelect = useRef(false);
  const scanHandledRef = useRef(false);
  const isLoaded =
    organizations !== undefined &&
    currentMembership !== undefined &&
    pendingJoinRequests !== undefined;
  const validOrganizations = React.useMemo(
    () =>
      (organizations ?? []).filter(
        (organization) =>
          typeof organization.organizationId === "string" &&
          organization.organizationId.length > 0,
      ),
    [organizations],
  );

  const handleSelectOrg = useCallback(
    async (organizationId: string) => {
      if (!organizationId) {
        setError("No se pudo identificar la organización seleccionada.");
        return;
      }

      setLoading(true);
      setError(null);
      setLastSelectedOrgId(organizationId);
      try {
        await setActiveOrganization({
          organizationId: organizationId as never,
        });
        resetApp();
        router.replace("/");
      } catch (err) {
        console.error("Error setting active organization:", err);
        captureHandledError(err, {
          area: "organization",
          action: "set_active_organization",
          extras: {
            organizationId,
          },
        });
        setError(
          "No pudimos cambiar de organización. Revisa tu conexión e intenta nuevamente.",
        );
      } finally {
        setLoading(false);
      }
    },
    [resetApp, router, setActiveOrganization],
  );

  const handleQrData = useCallback(
    async (data: string) => {
      if (scanHandledRef.current) return;
      scanHandledRef.current = true;
      setHasScannedQr(true);
      setError(null);
      setInviteFeedback(null);

      const token = parseJoinTokenFromUrl(data);
      if (!token) {
        scanHandledRef.current = false;
        setError("Este QR no corresponde a una invitación de MAT.");
        setTimeout(() => setHasScannedQr(false), 1200);
        return;
      }

      try {
        setScannerOpen(false);
        await CameraView.dismissScanner();
        await setPendingToken(token);
        router.replace("/join-gym-confirm");
      } catch (err) {
        scanHandledRef.current = false;
        captureHandledError(err, {
          area: "organization",
          action: "scan_member_invite_qr",
          extras: {
            qrDataLength: data.length,
          },
        });
        setError("No pudimos abrir la invitación. Intenta nuevamente.");
        setHasScannedQr(false);
      }
    },
    [router, setPendingToken],
  );

  useEffect(() => {
    if (!CameraView.isModernBarcodeScannerAvailable) return;

    const subscription = CameraView.onModernBarcodeScanned(
      (event: ScanningResult) => {
        if (event.data) {
          void handleQrData(event.data);
        }
      },
    );

    return () => subscription.remove();
  }, [handleQrData]);

  useEffect(() => {
    if (isLoaded && !hasAttemptedAutoSelect.current) {
      // If user has only one organization, auto-select it
      if (validOrganizations.length === 1) {
        const onlyOrganizationId = validOrganizations[0].organizationId;
        hasAttemptedAutoSelect.current = true;
        if (onlyOrganizationId) {
          handleSelectOrg(onlyOrganizationId);
        }
      }
    }
  }, [handleSelectOrg, isLoaded, validOrganizations]);

  if (!isLoaded || loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  if (validOrganizations.length === 0) {
    const pendingRequests = pendingJoinRequests ?? [];
    const hasPendingJoinRequest = pendingRequests.length > 0;

    const openQrScanner = async () => {
      setError(null);
      setInviteFeedback(null);

      if (!cameraPermission?.granted) {
        const nextPermission = await requestCameraPermission();
        if (!nextPermission.granted) {
          setError(
            "Necesitamos acceso a la cámara para escanear el QR de invitación.",
          );
          return;
        }
      }

      scanHandledRef.current = false;
      setHasScannedQr(false);

      if (CameraView.isModernBarcodeScannerAvailable) {
        try {
          await CameraView.launchScanner({
            barcodeTypes: ["qr"],
            isHighlightingEnabled: true,
            isGuidanceEnabled: true,
          });
          return;
        } catch (err) {
          captureHandledError(err, {
            area: "organization",
            action: "launch_member_invite_qr_scanner",
          });
        }
      }

      setScannerOpen(true);
    };

    const handleQrScanned = async ({ data }: BarcodeScanningResult) => {
      await handleQrData(data);
    };

    const redeemInviteCode = async () => {
      const code = inviteCode.trim();
      if (!code) {
        setError("Ingresa un código de invitación para continuar.");
        return;
      }

      setInviteLoading(true);
      setError(null);
      setInviteFeedback(null);
      try {
        const result = await redeemMemberInviteCode({ code });
        if (result.message === "already_member") {
          setInviteFeedback(
            `Ya tienes acceso a ${result.organizationName}. Abre el selector cuando se actualice tu cuenta.`,
          );
        } else if (result.message === "request_pending") {
          setInviteFeedback(
            `Ya existe una solicitud pendiente para ${result.organizationName}.`,
          );
        } else {
          setInviteFeedback(
            `Solicitud enviada a ${result.organizationName}. Un administrador debe aprobarla.`,
          );
        }
      } catch (err) {
        captureHandledError(err, {
          area: "organization",
          action: "redeem_member_invite_code",
          extras: {
            codeLength: code.length,
          },
        });
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos validar el código. Intenta nuevamente.",
        );
      } finally {
        setInviteLoading(false);
      }
    };

    return (
      <KeyboardAvoidingView
        style={[
          styles.container,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.noOrgScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.noOrgWrapper}>
            <EmptyState
              title={
                hasPendingJoinRequest
                  ? "Solicitud en revisión"
                  : "No se encontraron organizaciones"
              }
              description={
                hasPendingJoinRequest
                  ? "Tu solicitud fue enviada. Vas a poder acceder cuando un administrador la apruebe."
                  : "Ingresa un código de invitación o escanea el QR del gimnasio para solicitar acceso."
              }
            />
            {hasPendingJoinRequest ? (
              <View
                style={[
                  styles.codeCard,
                  { borderColor: isDark ? "#27272a" : "#e4e4e7" },
                ]}
              >
                <Text
                  style={[
                    styles.codeTitle,
                    { color: isDark ? "#fff" : "#000" },
                  ]}
                >
                  Esperando aprobación
                </Text>
                <View style={styles.pendingRequestList}>
                  {pendingRequests.map((request) => (
                    <View
                      key={request._id}
                      style={[
                        styles.pendingRequestItem,
                        { backgroundColor: isDark ? "#18181b" : "#f4f4f5" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pendingRequestOrg,
                          { color: isDark ? "#fff" : "#000" },
                        ]}
                      >
                        {request.organizationName}
                      </Text>
                      <Text
                        style={[
                          styles.pendingRequestMeta,
                          { color: isDark ? "#a1a1aa" : "#71717a" },
                        ]}
                      >
                        Enviada el{" "}
                        {new Date(request.requestedAt).toLocaleDateString(
                          "es-AR",
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text
                  style={[
                    styles.pendingHelpText,
                    { color: isDark ? "#a1a1aa" : "#71717a" },
                  ]}
                >
                  No hace falta enviar otra solicitud. Te avisaremos cuando el
                  gimnasio apruebe tu acceso.
                </Text>
                <ThemedPressable
                  type="secondary"
                  lightColor="#f4f4f5"
                  darkColor="#18181b"
                  style={styles.secondaryButton}
                  onPress={async () => {
                    await signOut();
                  }}
                  disabled={inviteLoading}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: isDark ? "#fff" : "#000" },
                    ]}
                  >
                    Cerrar sesión
                  </Text>
                </ThemedPressable>
              </View>
            ) : (
              <View style={styles.codeCard}>
                <Text
                  style={[
                    styles.codeTitle,
                    { color: isDark ? "#fff" : "#000" },
                  ]}
                >
                  Código de invitación
                </Text>
                <ThemedPressable
                  type="secondary"
                  lightColor="#f4f4f5"
                  darkColor="#18181b"
                  style={styles.scanButton}
                  onPress={() => {
                    if (scannerOpen) {
                      scanHandledRef.current = false;
                      setScannerOpen(false);
                      setHasScannedQr(false);
                      return;
                    }

                    void openQrScanner();
                  }}
                  disabled={inviteLoading}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: isDark ? "#fff" : "#000" },
                    ]}
                  >
                    {scannerOpen ? "Cerrar cámara" : "Escanear QR"}
                  </Text>
                </ThemedPressable>
                <Modal
                  visible={scannerOpen}
                  animationType="slide"
                  presentationStyle="fullScreen"
                  onRequestClose={() => {
                    scanHandledRef.current = false;
                    setScannerOpen(false);
                    setHasScannedQr(false);
                  }}
                >
                  <View style={styles.scannerModal}>
                    <CameraView
                      key={scannerOpen ? "scanner-open" : "scanner-closed"}
                      style={styles.scanner}
                      active={scannerOpen}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                      }}
                      onBarcodeScanned={
                        scannerOpen && !hasScannedQr
                          ? (event) => {
                              void handleQrScanned(event);
                            }
                          : undefined
                      }
                    />
                    <View pointerEvents="none" style={styles.scannerOverlay}>
                      <View style={styles.scannerModalFrame} />
                      <Text style={styles.scannerHint}>
                        Apunta la cámara al QR del gimnasio
                      </Text>
                    </View>
                    <Pressable
                      style={styles.scannerCloseButton}
                      onPress={() => {
                        scanHandledRef.current = false;
                        setScannerOpen(false);
                        setHasScannedQr(false);
                      }}
                    >
                      <Text style={styles.scannerCloseText}>Cerrar</Text>
                    </Pressable>
                  </View>
                </Modal>
                <Text
                  style={[
                    styles.orText,
                    { color: isDark ? "#71717a" : "#a1a1aa" },
                  ]}
                >
                  o ingresa el código manual
                </Text>
                <TextInput
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: isDark ? "#18181b" : "#f4f4f5",
                      color: isDark ? "#fff" : "#000",
                      borderColor: isDark ? "#27272a" : "#e4e4e7",
                    },
                  ]}
                  placeholder="MEM-XXXX-XXXX-XX"
                  placeholderTextColor={isDark ? "#71717a" : "#a1a1aa"}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={inviteCode}
                  editable={!inviteLoading}
                  onChangeText={setInviteCode}
                />
                {inviteFeedback ? (
                  <Text style={styles.successText}>{inviteFeedback}</Text>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <ThemedPressable
                  type="primary"
                  lightColor="#18181b"
                  darkColor="#f4f4f5"
                  style={styles.primaryButton}
                  onPress={() => {
                    void redeemInviteCode();
                  }}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={isDark ? "#000" : "#fff"}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.buttonText,
                        { color: isDark ? "#000" : "#fff" },
                      ]}
                    >
                      Enviar solicitud
                    </Text>
                  )}
                </ThemedPressable>
                <ThemedPressable
                  type="secondary"
                  lightColor="#f4f4f5"
                  darkColor="#18181b"
                  style={styles.secondaryButton}
                  onPress={async () => {
                    await signOut();
                  }}
                  disabled={inviteLoading}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: isDark ? "#fff" : "#000" },
                    ]}
                  >
                    Cerrar sesión
                  </Text>
                </ThemedPressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: isDark ? "#fff" : "#000" }]}>
          Seleccionar organización
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}
        >
          Elige a qué organización acceder
        </Text>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {lastSelectedOrgId ? (
              <ThemedPressable
                type="secondary"
                lightColor="#e4e4e7"
                darkColor="#27272a"
                style={styles.retryButton}
                onPress={() => handleSelectOrg(lastSelectedOrgId)}
              >
                <Text style={{ color: isDark ? "#fff" : "#000" }}>
                  Reintentar
                </Text>
              </ThemedPressable>
            ) : null}
          </View>
        ) : null}

        <FlatList
          data={validOrganizations}
          keyExtractor={(item, index) => `${item.organizationId}-${index}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[
                styles.orgCard,
                { borderColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
              onPress={() => {
                if (item.organizationId) {
                  void handleSelectOrg(item.organizationId);
                }
              }}
            >
              <View style={styles.orgInfo}>
                <Text
                  style={[styles.orgName, { color: isDark ? "#fff" : "#000" }]}
                >
                  {item.organizationName ?? ""}
                </Text>
                {item.organizationSlug && (
                  <Text
                    style={[
                      styles.orgSlug,
                      { color: isDark ? "#71717a" : "#a1a1aa" },
                    ]}
                  >
                    {item.organizationSlug ?? ""}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.roleText,
                  { color: isDark ? "#a1a1aa" : "#71717a" },
                ]}
              >
                {ROLE_LABELS[item.role ?? ""] ?? item.role ?? ""}
              </Text>
            </ThemedPressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  noOrgScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  noOrgWrapper: {
    width: "100%",
    gap: 20,
    maxWidth: 420,
  },
  codeCard: {
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  codeTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  scanButton: {
    minHeight: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  scannerModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  scannerModalFrame: {
    width: "82%",
    aspectRatio: 1,
    maxWidth: 360,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 28,
  },
  scannerHint: {
    marginTop: 24,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scannerCloseButton: {
    position: "absolute",
    top: 56,
    right: 20,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    alignItems: "center",
    justifyContent: "center",
  },
  scannerCloseText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  orText: {
    fontSize: 12,
    textAlign: "center",
  },
  codeInput: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  successText: {
    color: "#16a34a",
    fontSize: 13,
  },
  pendingRequestList: {
    gap: 8,
  },
  pendingRequestItem: {
    borderRadius: 12,
    padding: 12,
  },
  pendingRequestOrg: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  pendingRequestMeta: {
    fontSize: 13,
  },
  pendingHelpText: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444",
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  list: {
    gap: 12,
  },
  orgCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  orgSlug: {
    fontSize: 14,
  },
  roleText: {
    fontSize: 14,
    textTransform: "capitalize",
  },
});
