import { ClerkProvider, useAuth } from "@clerk/expo"
import { tokenCache } from '@clerk/expo/token-cache'
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native'
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { PendingJoinProvider } from '@/contexts/pending-join-context'

type AppResetContextValue = {
  resetApp: () => void
}

const AppResetContext = createContext<AppResetContextValue | null>(null)

export function useAppReset() {
  const context = useContext(AppResetContext)
  if (!context) {
    throw new Error('useAppReset must be used within Providers')
  }
  return context
}

function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const [resetKey, setResetKey] = useState(0)

  const resetApp = useCallback(() => {
    setResetKey((current) => current + 1)
  }, [])

  const convex = useMemo(
    () =>
      new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
        unsavedChangesWarning: false,
      }),
    // resetKey intentionally forces a fresh Convex client on org switch reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey]
  )

  const contextValue = useMemo(() => ({ resetApp }), [resetApp])

  return (
    <AppResetContext.Provider value={contextValue}>
      <GestureHandlerRootView key={resetKey}>
        <ClerkProvider
          tokenCache={tokenCache}
          publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <PendingJoinProvider>
              <ThemeProvider
                value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
              >
                {children}
              </ThemeProvider>
            </PendingJoinProvider>
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </GestureHandlerRootView>
    </AppResetContext.Provider>
  )
}

export default Providers
