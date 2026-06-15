import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import React, { useMemo } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PendingJoinProvider } from "@/contexts/pending-join-context";
import { AvatarIconProvider } from "@/contexts/avatar-icon-context";

function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();

  const convex = useMemo(
    () =>
      new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
        unsavedChangesWarning: false,
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider
        tokenCache={tokenCache}
        publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      >
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <PendingJoinProvider>
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <AvatarIconProvider>{children}</AvatarIconProvider>
            </ThemeProvider>
          </PendingJoinProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

export default Providers;
