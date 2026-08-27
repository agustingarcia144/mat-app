import {
  Stack,
  usePathname,
  useRouter,
  useSegments,
  type Href,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import "react-native-reanimated";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/expo";
import { api } from "@repo/convex";
import * as Sentry from "@sentry/react-native";
import Providers from "@/components/providers/providers";
import { usePendingJoin } from "@/contexts/pending-join-context";
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";
import { captureHandledError } from "@/lib/sentry";
import { useOTAUpdate } from "@/hooks/use-ota-update";

function normalizeNavigationSpanName(name: string) {
  return name
    .replace(/\/\d+(?=\/|$)/g, "/[id]")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, "/[id]");
}

function getNotificationHref(
  data: Notifications.NotificationContent["data"],
): Href | null {
  const href = data?.href;
  if (typeof href !== "string") {
    return null;
  }

  if (
    href.startsWith("/home/workout/") ||
    href === "/(tabs)/plan/payment-history" ||
    href === "/(tabs)/plan"
  ) {
    return href as Href;
  }

  return null;
}

const sentryTracingIntegration = Sentry.reactNativeTracingIntegration({
  beforeStartSpan: (options) => ({
    ...options,
    name: normalizeNavigationSpanName(options.name),
  }),
});

const rootStackScreenOptions = { headerShown: false };

function getPathnameForHref(href: Href): string {
  if (typeof href !== "string") {
    return "/";
  }

  if (href.startsWith("/(tabs)/")) {
    return href.replace("/(tabs)", "");
  }

  return href;
}

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  integrations: [sentryTracingIntegration],
  tracesSampleRate: __DEV__ ? 1 : 0.2,
  enableCaptureFailedRequests: true,

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
  useOTAUpdate();
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { pendingToken, isLoading: pendingLoading } = usePendingJoin();
  const convexUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    isAuthenticated ? {} : "skip",
  );
  const segments = useSegments();
  const segmentKey = useMemo(() => segments.join("/"), [segments]);
  const pathname = usePathname();
  const router = useRouter();
  const upsertPushToken = useMutation(
    api.pushNotifications.registerDeviceToken,
  );
  const registeredForUserRef = useRef<string | null>(null);
  const handledNotificationResponseRef = useRef<string | null>(null);

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
    sentryTracingIntegration.setCurrentRoute(pathname ?? "/");
    Sentry.setTag("route", pathname ?? "/");
  }, [pathname]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      convexUser === undefined ||
      currentMembership === undefined ||
      currentMembership == null ||
      convexUser == null ||
      !convexUser.onboardingCompleted
    ) {
      return;
    }

    const openNotificationTarget = (
      response: Notifications.NotificationResponse | null,
    ) => {
      const href = response
        ? getNotificationHref(response.notification.request.content.data)
        : null;
      const responseId = response?.notification.request.identifier ?? null;
      if (responseId && handledNotificationResponseRef.current === responseId) {
        return;
      }
      if (href) {
        handledNotificationResponseRef.current = responseId;
        router.push(href);
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openNotificationTarget,
    );

    void Notifications.getLastNotificationResponseAsync().then(
      openNotificationTarget,
    );

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, convexUser, currentMembership, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      Sentry.setUser(null);
      Sentry.setTag("auth_state", "anonymous");
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
      Sentry.setContext("organization", null);
      Sentry.setContext("convex_user", null);
      return;
    }

    const primaryEmail =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress;

    Sentry.setUser({
      id: convexUser?.externalId ?? user?.id,
      email: primaryEmail,
      username: user?.username ?? convexUser?.username ?? undefined,
    });
    Sentry.setTag("auth_state", "authenticated");

    if (convexUser) {
      Sentry.setContext("convex_user", {
        onboardingCompleted: convexUser.onboardingCompleted ?? false,
        onboardingStep1Completed: convexUser.onboardingStep1Completed ?? false,
      });
    } else {
      Sentry.setContext("convex_user", null);
    }

    if (currentMembership?.organization) {
      Sentry.setTag("organization_id", currentMembership.organization._id);
      Sentry.setTag("organization_role", currentMembership.role);
      Sentry.setContext("organization", {
        id: currentMembership.organization._id,
        name: currentMembership.organization.name,
        slug: currentMembership.organization.slug,
        role: currentMembership.role,
        status: currentMembership.status,
      });
    } else {
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
      Sentry.setContext("organization", null);
    }
  }, [isAuthenticated, user, convexUser, currentMembership]);

  useEffect(() => {
    if (isLoading) return;

    const [topSegment] = segmentKey.split("/");
    const inAuthGroup = topSegment === "(tabs)";
    const inOnboarding =
      topSegment === "onboarding-notifications" ||
      topSegment === "onboarding" ||
      topSegment === "onboarding-2";
    const inOrgSelection = topSegment === "select-organization";
    const inJoinConfirm = topSegment === "join-gym-confirm";
    const inAuthPage =
      topSegment === undefined ||
      topSegment === "" ||
      topSegment === "sign-in" ||
      topSegment === "sign-up" ||
      topSegment === "forgot-password";

    const replaceIfNeeded = (href: Href) => {
      if (pathname !== getPathnameForHref(href)) {
        router.replace(href);
      }
    };

    if (!isAuthenticated) {
      if (inAuthGroup || inOnboarding || inOrgSelection || inJoinConfirm) {
        replaceIfNeeded("/");
      }
      return;
    }

    // Deferred deep link: show join confirmation when we have a pending token
    if (!pendingLoading && pendingToken && !inJoinConfirm && !inAuthPage) {
      replaceIfNeeded("/join-gym-confirm");
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
        replaceIfNeeded("/select-organization");
      }
      return;
    }

    const needsOnboarding =
      convexUser == null || !convexUser.onboardingCompleted;

    if (inOrgSelection) {
      if (needsOnboarding) {
        replaceIfNeeded("/onboarding-notifications");
      } else {
        replaceIfNeeded("/(tabs)/home");
      }
      return;
    }

    if (needsOnboarding) {
      if (!inOnboarding) {
        const step1Done = convexUser?.onboardingStep1Completed === true;
        replaceIfNeeded(
          step1Done ? "/onboarding-2" : "/onboarding-notifications",
        );
      }
      return;
    }

    if (inOnboarding || inAuthPage) {
      replaceIfNeeded("/(tabs)/home");
      return;
    }

    // join-gym-confirm is a valid standalone destination; excluding it here
    // prevents an infinite redirect loop with the deferred deep-link rule above
    // (pending token -> /join-gym-confirm -> fallthrough back to /home -> ...).
    if (!inAuthGroup && !inJoinConfirm) {
      replaceIfNeeded("/(tabs)/home");
    }
  }, [
    isAuthenticated,
    isLoading,
    pendingToken,
    pendingLoading,
    convexUser,
    currentMembership,
    orgRedirectReady,
    segmentKey,
    pathname,
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
        captureHandledError(error, {
          area: "notifications",
          action: "register_push_token",
          extras: {
            userId: convexUser.externalId,
          },
        });
      }
    };

    void registerPushToken();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, convexUser, upsertPushToken]);

  return (
    <>
      <Stack screenOptions={rootStackScreenOptions}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen name="onboarding-notifications" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding-2" />
        <Stack.Screen name="select-organization" />
        <Stack.Screen name="join-gym-confirm" />
        <Stack.Screen name="(tabs)" />
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
