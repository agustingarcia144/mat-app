import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { OtpInput } from "react-native-otp-entry";
import { useSSO } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter } from "expo-router";
import {
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@repo/convex";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import AntDesign from "@expo/vector-icons/AntDesign";
import LoadingScreen from "@/components/shared/screens/loading-screen";
import { captureHandledError } from "@/lib/sentry";

function extractClerkErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as any).errors) &&
    (err as any).errors.length > 0
  ) {
    return (
      (err as any).errors[0].longMessage ??
      (err as any).errors[0].message ??
      "Error desconocido"
    );
  }
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}

const AUTH_LOADING_TIMEOUT_MS = 10000;

type SecondFactorStrategy =
  | "email_code"
  | "phone_code"
  | "totp"
  | "backup_code";

type SecondFactorOption = {
  strategy: SecondFactorStrategy;
  emailAddressId?: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
};

function AuthenticatedRedirect() {
  const getOrCreateUser = useMutation(api.users.getOrCreateCurrentUser);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        await getOrCreateUser();
      } catch (err) {
        console.error("Failed to get/create user:", err);
        captureHandledError(err, {
          area: "auth",
          action: "get_or_create_user_after_sign_in",
        });
      }
    };
    handleRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <LoadingScreen />;
}

function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [secondFactorStrategy, setSecondFactorStrategy] =
    useState<SecondFactorStrategy | null>(null);
  const [secondFactorOptions, setSecondFactorOptions] = useState<
    SecondFactorOption[]
  >([]);

  const prepareSecondFactor = async (factor: SecondFactorOption) => {
    if (!signIn) return;

    if (factor.strategy === "email_code") {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
    } else if (factor.strategy === "phone_code") {
      await signIn.prepareSecondFactor({
        strategy: "phone_code",
        phoneNumberId: factor.phoneNumberId,
      });
    }

    setSecondFactorStrategy(factor.strategy);
    setOtpCode("");
    setError("");
    setShowOtpScreen(true);
  };

  const onSignIn = async () => {
    if (!isLoaded || !signIn) return;
    if (!email.trim()) {
      setError("Ingresá tu correo electrónico.");
      return;
    }
    if (!password) {
      setError("Ingresá tu contraseña.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        return;
      }

      if (result.status === "needs_second_factor") {
        const factors = (
          (result.supportedSecondFactors ?? []) as SecondFactorOption[]
        ).filter((factor) =>
          ["totp", "email_code", "phone_code", "backup_code"].includes(
            factor.strategy,
          ),
        );
        setSecondFactorOptions(factors);

        const emailFactor = factors.find((f) => f.strategy === "email_code");
        const phoneFactor = factors.find((f) => f.strategy === "phone_code");
        const totpFactor = factors.find((f) => f.strategy === "totp");
        const backupFactor = factors.find((f) => f.strategy === "backup_code");
        const preferredFactor =
          totpFactor ?? emailFactor ?? phoneFactor ?? backupFactor;

        if (!preferredFactor) {
          setError(
            "Verificación en dos pasos no configurada para esta cuenta.",
          );
          return;
        }

        await prepareSecondFactor(preferredFactor);
        return;
      }

      setError("Completá los pasos requeridos para iniciar sesión.");
    } catch (err) {
      captureHandledError(err, {
        area: "auth",
        action: "sign_in_with_password",
      });
      setError(extractClerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onOtpSubmit = async () => {
    if (!isLoaded || !signIn || !secondFactorStrategy || !otpCode.trim())
      return;

    setOtpLoading(true);
    setError("");

    try {
      const code = otpCode.trim();
      const result =
        secondFactorStrategy === "email_code"
          ? await signIn.attemptSecondFactor({ strategy: "email_code", code })
          : secondFactorStrategy === "phone_code"
            ? await signIn.attemptSecondFactor({
                strategy: "phone_code",
                code,
              })
            : await signIn.attemptSecondFactor({
                strategy:
                  secondFactorStrategy === "totp" ? "totp" : "backup_code",
                code,
              });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else {
        setError("Código inválido o vencido. Revisá e intentá de nuevo.");
      }
    } catch (err) {
      captureHandledError(err, {
        area: "auth",
        action: "verify_second_factor",
        extras: {
          strategy: secondFactorStrategy,
        },
      });
      setError(extractClerkErrorMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const onBackFromOtp = () => {
    setShowOtpScreen(false);
    setOtpCode("");
    setSecondFactorStrategy(null);
    setSecondFactorOptions([]);
    setError("");
  };

  const onSelectSecondFactor = async (factor: SecondFactorOption) => {
    setOtpLoading(true);
    try {
      await prepareSecondFactor(factor);
    } catch (err) {
      captureHandledError(err, {
        area: "auth",
        action: "prepare_second_factor",
        extras: {
          strategy: factor.strategy,
        },
      });
      setError(extractClerkErrorMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const onGoogleSignIn = async () => {
    setLoading(true);
    setError("");

    try {
      const { createdSessionId, setActive: oauthSetActive } =
        await startSSOFlow({ strategy: "oauth_google" });

      if (createdSessionId) {
        await oauthSetActive!({ session: createdSessionId });
      }
    } catch (err) {
      captureHandledError(err, {
        area: "auth",
        action: "sign_in_with_google",
      });
      setError("Error al iniciar sesión con Google");
    } finally {
      setLoading(false);
    }
  };

  const onAppleSignIn = async () => {
    setLoading(true);
    setError("");

    try {
      const { createdSessionId, setActive: oauthSetActive } =
        await startSSOFlow({ strategy: "oauth_apple" });

      if (createdSessionId) {
        await oauthSetActive!({ session: createdSessionId });
      }
    } catch (err) {
      captureHandledError(err, {
        area: "auth",
        action: "sign_in_with_apple",
      });
      setError("Error al iniciar sesión con Apple");
    } finally {
      setLoading(false);
    }
  };

  if (showOtpScreen && secondFactorStrategy) {
    const otpTitle =
      secondFactorStrategy === "totp"
        ? "Código del autenticador"
        : secondFactorStrategy === "backup_code"
          ? "Código de respaldo"
          : "Código de verificación";
    const otpSubtitle =
      secondFactorStrategy === "email_code"
        ? "Revisá tu correo e ingresá el código que te enviamos."
        : secondFactorStrategy === "phone_code"
          ? "Revisá tu teléfono e ingresá el código que te enviamos."
          : secondFactorStrategy === "totp"
            ? "Ingresá el código de tu aplicación de autenticación."
            : "Ingresá uno de tus códigos de respaldo.";
    const otherSecondFactorOptions = secondFactorOptions.filter(
      (factor) => factor.strategy !== secondFactorStrategy,
    );

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.container,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
      >
        <View style={styles.content}>
          <Text style={[styles.title, { color: isDark ? "#fff" : "#000" }]}>
            {otpTitle}
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}
          >
            {otpSubtitle}
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <OtpInput
              numberOfDigits={6}
              onTextChange={setOtpCode}
              autoFocus
              disabled={otpLoading}
              focusColor={isDark ? "#fff" : "#000"}
              theme={{
                containerStyle: { marginBottom: 24 },
                pinCodeContainerStyle: {
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: isDark ? "#27272a" : "#e4e4e7",
                  backgroundColor: isDark ? "#18181b" : "#f4f4f5",
                },
                pinCodeTextStyle: {
                  color: isDark ? "#fff" : "#000",
                  fontSize: 18,
                },
              }}
            />

            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, otpLoading && styles.buttonDisabled]}
              onPress={onOtpSubmit}
              disabled={otpLoading || !otpCode.trim()}
            >
              {otpLoading ? (
                <ActivityIndicator color={isDark ? "#000" : "#fff"} />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? "#000" : "#fff" },
                  ]}
                >
                  Verificar
                </Text>
              )}
            </ThemedPressable>

            <ThemedPressable onPress={onBackFromOtp}>
              <Text style={[styles.link, { color: isDark ? "#fff" : "#000" }]}>
                Volver a inicio de sesión
              </Text>
            </ThemedPressable>

            {otherSecondFactorOptions.map((factor) => (
              <ThemedPressable
                key={`${factor.strategy}-${factor.safeIdentifier ?? factor.emailAddressId ?? factor.phoneNumberId ?? "default"}`}
                onPress={() => onSelectSecondFactor(factor)}
                disabled={otpLoading}
              >
                <Text
                  style={[styles.link, { color: isDark ? "#fff" : "#000" }]}
                >
                  {factor.strategy === "totp"
                    ? "Usar código del autenticador"
                    : factor.strategy === "email_code"
                      ? "Enviar código por email"
                      : factor.strategy === "phone_code"
                        ? "Enviar código por SMS"
                        : "Usar código de respaldo"}
                </Text>
              </ThemedPressable>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}
    >
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/mat-wolf.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Mat wolf mascot"
        />
        <Text style={[styles.title, { color: isDark ? "#fff" : "#000" }]}>
          Mat Gestion Staff
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? "#a1a1aa" : "#71717a" }]}
        >
          Inicia sesión con tu cuenta de administrador o entrenador
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? "#18181b" : "#f4f4f5",
                color: isDark ? "#fff" : "#000",
                borderColor: isDark ? "#27272a" : "#e4e4e7",
              },
            ]}
            placeholder="Correo electrónico"
            placeholderTextColor={isDark ? "#71717a" : "#a1a1aa"}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? "#18181b" : "#f4f4f5",
                color: isDark ? "#fff" : "#000",
                borderColor: isDark ? "#27272a" : "#e4e4e7",
              },
            ]}
            placeholder="Contraseña"
            placeholderTextColor={isDark ? "#71717a" : "#a1a1aa"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <ThemedPressable
            type="primary"
            lightColor="#000"
            darkColor="#fff"
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? "#000" : "#fff"} />
            ) : (
              <Text
                style={[styles.buttonText, { color: isDark ? "#000" : "#fff" }]}
              >
                Iniciar sesión
              </Text>
            )}
          </ThemedPressable>

          <View style={styles.divider}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
            />
            <Text
              style={[
                styles.dividerText,
                { color: isDark ? "#71717a" : "#a1a1aa" },
              ]}
            >
              o
            </Text>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
            />
          </View>

          <ThemedPressable
            type="secondary"
            lightColor="#f4f4f5"
            darkColor="#18181b"
            style={[
              styles.oauthButton,
              { borderColor: isDark ? "#27272a" : "#e4e4e7" },
            ]}
            onPress={onGoogleSignIn}
            disabled={loading}
          >
            <AntDesign
              name="google"
              size={22}
              color={isDark ? "#fff" : "#000"}
            />
            <Text
              style={[
                styles.oauthButtonText,
                { color: isDark ? "#fff" : "#000" },
              ]}
            >
              Continuar con Google
            </Text>
          </ThemedPressable>

          {Platform.OS === "ios" ? (
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[
                styles.oauthButton,
                { borderColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
              onPress={onAppleSignIn}
              disabled={loading}
            >
              <AntDesign
                name="apple"
                size={22}
                color={isDark ? "#fff" : "#000"}
              />
              <Text
                style={[
                  styles.oauthButtonText,
                  { color: isDark ? "#fff" : "#000" },
                ]}
              >
                Continuar con Apple
              </Text>
            </ThemedPressable>
          ) : null}

          <ThemedPressable onPress={() => router.push("/sign-up")}>
            <Text style={[styles.link, { color: isDark ? "#fff" : "#000" }]}>
              ¿No tienes cuenta? <Text style={styles.linkBold}>Regístrate</Text>
            </Text>
          </ThemedPressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function AuthLoadingWithTimeout({ children }: { children: React.ReactNode }) {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setTimedOut(true);
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (timedOut) {
    return <SignInForm />;
  }

  return <>{children}</>;
}

export default function IndexScreen() {
  return (
    <>
      <AuthLoading>
        <AuthLoadingWithTimeout>
          <LoadingScreen />
        </AuthLoadingWithTimeout>
      </AuthLoading>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        <AuthenticatedRedirect />
      </Authenticated>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: 180,
    height: 180,
    alignSelf: "center",
    marginBottom: 24,
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
  errorContainer: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#fafafa",
    fontSize: 14,
  },
  form: {
    gap: 16,
  },
  input: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    height: 48,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
  },
  oauthButton: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  oauthButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  link: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  linkBold: {
    fontWeight: "600",
  },
});
