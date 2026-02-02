import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useUser, useClerk } from '@clerk/clerk-expo'
import { Authenticated, AuthLoading } from 'convex/react'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

function DashboardContent() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title">Panel</ThemedText>
        <ThemedText style={styles.welcome}>
          ¡Hola, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
        </ThemedText>

        <View style={styles.placeholder}>
          <ThemedText>El contenido de tu panel aparecerá aquí</ThemedText>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: isDark ? '#18181b' : '#f4f4f5',
              borderColor: isDark ? '#27272a' : '#e4e4e7',
            },
          ]}
          onPress={() => signOut()}
        >
          <Text
            style={[styles.buttonText, { color: isDark ? '#fff' : '#000' }]}
          >
            Cerrar sesión
          </Text>
        </TouchableOpacity>
      </View>
    </ThemedView>
  )
}

export default function DashboardScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Authenticated>
        <DashboardContent />
      </Authenticated>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  welcome: {
    marginTop: 8,
    marginBottom: 32,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
})
