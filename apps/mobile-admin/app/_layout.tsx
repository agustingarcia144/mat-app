import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import "react-native-reanimated";
import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useUser } from "@clerk/expo";
import { api } from "@repo/convex";
import * as Sentry from "@sentry/react-native";
import Providers from "@/components/providers/providers";
import { isOrgStaffRole } from "@/lib/security/roles";

function normalizeNavigationSpanName(name: string) {
  return name
    .replace(/\/\d+(?=\/|$)/g, "/[id]")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, "/[id]");
}

const sentryTracingIntegration = Sentry.reactNativeTracingIntegration({
  beforeStartSpan: (options) => ({
    ...options,
    name: normalizeNavigationSpanName(options.name),
  }),
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  integrations: [sentryTracingIntegration],
  tracesSampleRate: __DEV__ ? 1 : 0.2,
  enableCaptureFailedRequests: true,
  sendDefaultPii: true,
  enableLogs: false,
});

WebBrowser.maybeCompleteAuthSession();

function RootLayoutNav() {
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const staffOrganizations = useQuery(
    api.organizationMemberships.getMyStaffOrganizations,
    isAuthenticated ? {} : "skip",
  );
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    isAuthenticated ? {} : "skip",
  );
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    sentryTracingIntegration.setCurrentRoute(pathname ?? "/");
    Sentry.setTag("route", pathname ?? "/");
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      Sentry.setUser(null);
      Sentry.setTag("auth_state", "anonymous");
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
      return;
    }

    const primaryEmail =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress;

    Sentry.setUser({
      id: user?.id,
      email: primaryEmail,
      username: user?.username ?? undefined,
    });
    Sentry.setTag("auth_state", "authenticated");

    if (currentMembership?.organization) {
      Sentry.setTag("organization_id", currentMembership.organization._id);
      Sentry.setTag("organization_role", currentMembership.role);
    } else {
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
    }
  }, [isAuthenticated, user, currentMembership]);

  useEffect(() => {
    if (isLoading) return;

    const topSegment = segments[0] as string | undefined;
    const inAuthGroup = topSegment === "(tabs)";
    const inOrgSelection = topSegment === "select-organization";
    const inAccessDenied = topSegment === "access-denied";
    const inAuthPage =
      topSegment === undefined ||
      topSegment === "sign-in" ||
      topSegment === "sign-up" ||
      topSegment === "sso-callback";

    if (!isAuthenticated) {
      if (inAuthGroup || inOrgSelection || inAccessDenied) {
        router.replace("/");
      }
      return;
    }

    if (staffOrganizations === undefined || currentMembership === undefined) {
      return;
    }

    const hasStaffOrganization = staffOrganizations.length > 0;

    if (!hasStaffOrganization) {
      if (!inAccessDenied) {
        router.replace("/access-denied");
      }
      return;
    }

    const currentRole = currentMembership?.role;
    const hasActiveStaffOrg =
      currentMembership != null && isOrgStaffRole(currentRole);

    if (!hasActiveStaffOrg) {
      if (!inOrgSelection) {
        router.replace("/select-organization");
      }
      return;
    }

    if (inOrgSelection || inAccessDenied || inAuthPage) {
      router.replace("/(tabs)/home");
      return;
    }

    if (!inAuthGroup) {
      router.replace("/(tabs)/home");
    }
  }, [
    isAuthenticated,
    isLoading,
    staffOrganizations,
    currentMembership,
    segments,
    router,
  ]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen name="select-organization" />
        <Stack.Screen name="access-denied" />
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
