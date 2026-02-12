import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser, useClerk } from '@clerk/clerk-expo'
import { Authenticated, AuthLoading } from 'convex/react'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedText } from '@/components/themed-text'
import { ThemedButton } from '@/components/themed-button'
import { Colors } from '@/constants/theme'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const backgroundColor = Colors[colorScheme ?? 'light'].background
  const tintColor = Colors[colorScheme ?? 'light'].tint

  return (
    <View
      style={[
        styles.container,
        styles.centered,
        { backgroundColor },
      ]}
    >
      <ActivityIndicator size="large" color={tintColor} />
    </View>
  )
}

function ProfileContent() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const primaryEmail =
    user?.emailAddresses?.[0]?.emailAddress ??
    user?.primaryEmailAddress?.emailAddress
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    primaryEmail ||
    'Usuario'
  const imageUrl = user?.imageUrl

  const buttonBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'
  const backgroundColor = Colors[colorScheme ?? 'light'].background

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 44 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarRow}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.avatar}
              accessibilityLabel="Avatar"
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Text
                style={[
                  styles.avatarPlaceholderText,
                  { color: isDark ? '#fff' : '#000' },
                ]}
              >
                {(
                  user?.firstName?.[0] ||
                  primaryEmail?.[0] ||
                  '?'
                ).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <ThemedText type="title" style={styles.title}>
          {fullName}
        </ThemedText>
        {primaryEmail ? (
          <ThemedText style={styles.subtitle}>{primaryEmail}</ThemedText>
        ) : null}

        <ThemedButton
          type="secondary"
          lightColor={buttonBg}
          darkColor={buttonBg}
          style={[styles.button, { marginTop: 32 }]}
          onPress={() => signOut()}
        >
          <Text
            style={[styles.buttonText, { color: isDark ? '#fff' : '#000' }]}
          >
            Cerrar sesión
          </Text>
        </ThemedButton>
      </ScrollView>
    </View>
  )
}

export default function ProfileScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <ProfileContent />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
})
