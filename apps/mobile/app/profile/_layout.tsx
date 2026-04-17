import { Stack } from "expo-router";
import { Platform } from "react-native";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import HeaderBackButton from "@/components/ui/header-back-button";
import HeaderCloseButton from "@/components/ui/header-close-button";
import HeaderPlayPauseButton from "@/components/ui/header-play-pause-button";
import { ExerciseVideoProvider } from "@/contexts/exercise-video-context";

export default function ProfileLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#000" : "#fff";
  const headerTintColor = Colors[colorScheme ?? "light"].text;

  return (
    <ExerciseVideoProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="index"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerTitle: "Configuración",
            headerShadowVisible: false,
            headerStyle: { backgroundColor },
            headerTintColor,
            headerRight: () => <HeaderCloseButton />,
            headerLeft: () => null,
          }}
        />
        <Stack.Screen
          name="planifications/index"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerTitle: "Planificaciones",
            headerShadowVisible: false,
            headerStyle: { backgroundColor },
            headerTintColor,
            headerLeft: () => <HeaderBackButton />,
          }}
        />
        <Stack.Screen
          name="planifications/[assignmentId]"
          options={{
            headerShown: true,
            headerTransparent: true,
            title: "",
            headerLeft: () => <HeaderBackButton />,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="planifications/[assignmentId]/[exerciseId]"
          options={{
            headerShown: true,
            headerTransparent: true,
            title: "",
            headerLeft: () => <HeaderBackButton />,
            headerRight: () => <HeaderPlayPauseButton />,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="planifications/[assignmentId]/[exerciseId]/video"
          options={{
            presentation: "formSheet",
            headerShown: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: "transparent" },
            title: "",
            headerRight: () => <HeaderCloseButton />,
            headerLeft: () => null,
            headerShadowVisible: false,
            gestureEnabled: true,
            sheetAllowedDetents: [0.7],
            sheetGrabberVisible: true,
            sheetShouldOverflowTopInset: Platform.OS === "android",
          }}
        />
      </Stack>
    </ExerciseVideoProvider>
  );
}
