import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type SupportedPlatform = "ios" | "android";

let notificationHandlerConfigured = false;

/**
 * Returns whether the user has already responded to the system notification
 * permission prompt (granted or denied). When true, we can skip showing the
 * onboarding notification screen.
 */
export async function hasNotificationPermissionBeenRequested(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return true;
  }
  const { status } = await Notifications.getPermissionsAsync();
  return status !== Notifications.PermissionStatus.UNDETERMINED;
}

function getProjectId(): string | undefined {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easConfigProjectId = Constants.easConfig?.projectId;
  return expoConfigProjectId ?? easConfigProjectId;
}

export async function registerForPushNotificationsAsync(): Promise<{
  token: string | null;
  platform: SupportedPlatform | null;
}> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { token: null, platform: null };
  }

  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
    return {
      token: null,
      platform: Platform.OS,
    };
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing EAS project ID for push notifications");
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return {
    token: tokenResponse.data,
    platform: Platform.OS,
  };
}
