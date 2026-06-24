import { Stack } from "expo-router";
import { Platform } from "react-native";
import HeaderBackButton from "@/components/ui/header-back-button";
import HeaderCloseButton from "@/components/ui/header-close-button";

const renderHeaderBackButton = () => <HeaderBackButton />;
const renderHeaderCloseButton = () => <HeaderCloseButton />;
const renderEmptyHeaderLeft = () => null;

const homeStackScreenOptions = { headerShown: false };
const completeScreenOptions = {
  headerShown: false,
  gestureEnabled: false,
  presentation: "fullScreenModal" as const,
};
const logSetSheetDetents = [0.85];
const exerciseVideoSheetDetents = [0.7];
const transparentContentStyle = { backgroundColor: "transparent" };

const transparentHeaderOptions = {
  headerShown: true,
  headerTransparent: true,
  title: "",
  headerLeft: renderHeaderBackButton,
  headerShadowVisible: false,
};

// Presented as a full-screen modal so it covers the native tab bar, giving the
// workout session the full screen height (footer button sits at the bottom).
// iOS hides the native header and renders its own (WorkoutHeader) so the
// trailing controls can be separate Liquid Glass buttons; Android keeps the
// native header with a left-aligned title. `headerShown` is set statically here
// (not via per-render screen options) because toggling it through setOptions on
// every render re-renders the screen body and causes an update loop.
const workoutSessionOptions = {
  ...transparentHeaderOptions,
  presentation: "fullScreenModal" as const,
  headerShown: Platform.OS !== "ios",
  headerTitleAlign: "left" as const,
};

const logSetOptions = {
  presentation: "formSheet" as const,
  headerShown: true,
  headerTransparent: true,
  title: "",
  headerRight: renderHeaderCloseButton,
  headerShadowVisible: false,
  gestureEnabled: true,
  sheetAllowedDetents: logSetSheetDetents,
  sheetShouldOverflowTopInset: Platform.OS === "android",
};

const exerciseVideoOptions = {
  presentation: "formSheet" as const,
  headerShown: true,
  headerTransparent: true,
  contentStyle: transparentContentStyle,
  title: "",
  headerRight: renderHeaderCloseButton,
  headerLeft: renderEmptyHeaderLeft,
  headerShadowVisible: false,
  gestureEnabled: true,
  sheetAllowedDetents: exerciseVideoSheetDetents,
  sheetGrabberVisible: true,
  sheetShouldOverflowTopInset: Platform.OS === "android",
};

export default function InicioLayout() {
  return (
    <Stack screenOptions={homeStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="workout/[sessionId]"
        options={workoutSessionOptions}
      />
      <Stack.Screen
        name="workout/complete"
        options={completeScreenOptions}
      />
      <Stack.Screen
        name="workout/log-set"
        options={logSetOptions}
      />
      <Stack.Screen
        name="exercise/[exerciseId]"
        options={transparentHeaderOptions}
      />
      <Stack.Screen
        name="exercise/video/[exerciseId]"
        options={exerciseVideoOptions}
      />
      <Stack.Screen
        name="schedule/[scheduleId]"
        options={transparentHeaderOptions}
      />
      <Stack.Screen
        name="planification/[assignmentId]"
        options={transparentHeaderOptions}
      />
    </Stack>
  );
}
