import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import "react-native-reanimated";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import * as Sentry from "@sentry/react-native";
import Providers from "@/components/providers/providers";
import { usePendingJoin } from "@/contexts/pending-join-context";
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

WebBrowser.maybeCompleteAuthSession();

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { pendingToken, isLoading: pendingLoading } = usePendingJoin();
  const convexUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembership,
    isAuthenticated ? {} : "skip",
  );
  const segments = useSegments();
  const router = useRouter();
  const upsertPushToken = useMutation(
    api.pushNotifications.registerDeviceToken,
  );
  const registeredForUserRef = useRef<string | null>(null);

  // Track whether the user ever had an active membership this session.
  // When membership drops from non-null to null (e.g. transient auth failure
  // on flaky Android networks), wait before redirecting to select-organization
  // to give the auth token time to refresh.
  const hadMembershipRef = useRef(false);
  const [orgRedirectReady, setOrgRedirectReady] = useState(false);

  useEffect(() => {
    if (currentMembership != null) {
      hadMembershipRef.current = true;
      setOrgRedirectReady(false);
      return;
    }

    // currentMembership is null or undefined
    if (currentMembership === undefined) {
      // Still loading — not ready to redirect
      setOrgRedirectReady(false);
      return;
    }

    // currentMembership is null (query ran, no membership found)
    if (!hadMembershipRef.current) {
      // Never had a membership — redirect immediately
      setOrgRedirectReady(true);
      return;
    }

    // Had a membership before but lost it — wait briefly for auth to recover
    setOrgRedirectReady(false);
    const timer = setTimeout(() => {
      setOrgRedirectReady(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [currentMembership]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(tabs)";
    const topSegment = segments[0] as string | undefined;
    const inSettings = topSegment === "profile";
    const inOnboarding =
      segments[0] === "onboarding-notifications" ||
      segments[0] === "onboarding" ||
      segments[0] === "onboarding-2";
    const inOrgSelection = segments[0] === "select-organization";
    const inJoinConfirm = segments[0] === "join-gym-confirm";
    const inAuthPage =
      segments[0] === undefined ||
      segments[0] === "sign-in" ||
      segments[0] === "sign-up";

    if (!isAuthenticated) {
      if (
        inAuthGroup ||
        inSettings ||
        inOnboarding ||
        inOrgSelection ||
        inJoinConfirm
      ) {
        router.replace("/");
      }
      return;
    }

    // Deferred deep link: show join confirmation when we have a pending token
    if (!pendingLoading && pendingToken && !inJoinConfirm && !inAuthPage) {
      router.replace("/join-gym-confirm");
      return;
    }

    if (convexUser === undefined || currentMembership === undefined) {
      return;
    }

    const hasActiveOrganization = currentMembership != null;

    // Authenticated users must always have an active org before they can access app content.
    if (!hasActiveOrganization) {
      if (!orgRedirectReady) return; // Wait for debounce before redirecting
      if (!inOrgSelection && !inJoinConfirm) {
        router.replace("/select-organization");
      }
      return;
    }

    const needsOnboarding =
      convexUser == null || !convexUser.onboardingCompleted;

    if (inOrgSelection) {
      if (needsOnboarding) {
        router.replace("/onboarding-notifications");
      } else {
        router.replace("/(tabs)/home");
      }
      return;
    }

    if (needsOnboarding) {
      if (!inOnboarding) {
        const step1Done = convexUser?.onboardingStep1Completed === true;
        router.replace(
          step1Done ? "/onboarding-2" : "/onboarding-notifications",
        );
      }
      return;
    }

    if (inOnboarding || inAuthPage) {
      router.replace("/(tabs)/home");
      return;
    }

    if (!inAuthGroup && !inSettings) {
      router.replace("/(tabs)/home");
    }
  }, [
    isAuthenticated,
    isLoading,
    pendingToken,
    pendingLoading,
    convexUser,
    currentMembership,
    orgRedirectReady,
    segments,
    router,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      registeredForUserRef.current = null;
      return;
    }

    if (!convexUser || convexUser === undefined) {
      return;
    }

    if (!convexUser.onboardingCompleted) {
      return;
    }

    if (registeredForUserRef.current === convexUser.externalId) {
      return;
    }

    let cancelled = false;

    const registerPushToken = async () => {
      try {
        const { token, platform } = await registerForPushNotificationsAsync();
        if (cancelled || !token || !platform) {
          return;
        }

        await upsertPushToken({
          token,
          platform,
        });
        registeredForUserRef.current = convexUser.externalId;
      } catch (error) {
        console.warn("Push notification setup failed", error);
      }
    };

    void registerPushToken();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, convexUser, upsertPushToken]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen name="onboarding-notifications" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding-2" />
        <Stack.Screen name="select-organization" />
        <Stack.Screen name="join-gym-confirm" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile"
          options={{
            presentation: "modal",
            headerShown: false,
            gestureEnabled: true,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <Providers>
      <RootLayoutNav />
    </Providers>
  );
});
