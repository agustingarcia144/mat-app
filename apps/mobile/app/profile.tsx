import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useUser, useClerk } from '@clerk/clerk-expo'
import { Authenticated, AuthLoading, useMutation, useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { Colors } from '@/constants/theme'
import LoadingScreen from '@/components/shared/screens/loading-screen'
import { useAppReset } from '@/components/providers/providers'

function ProfileContent() {
  const router = useRouter()
  const { user } = useUser()
  const { signOut } = useClerk()
  const organizations = useQuery(api.organizationMemberships.getMyOrganizations)
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization
  )
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization
  )
  const { resetApp } = useAppReset()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [switchingOrgId, setSwitchingOrgId] = React.useState<string | null>(
    null
  )
  const [orgError, setOrgError] = React.useState<string | null>(null)

  const primaryEmail =
    user?.emailAddresses?.[0]?.emailAddress ??
    user?.primaryEmailAddress?.emailAddress
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    primaryEmail ||
    'Usuario'
  const imageUrl = user?.imageUrl
  const memberships = React.useMemo(
    () =>
      (organizations ?? []).filter(
        (membership) =>
          typeof membership.organizationId === 'string' &&
          membership.organizationId.length > 0
      ),
    [organizations]
  )
  const hasMultipleOrganizations = memberships.length > 1
  const activeOrgId = currentMembership?.organization?._id ?? null
  const isLoaded = organizations !== undefined && currentMembership !== undefined

  const buttonBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'
  const backgroundColor = Colors[colorScheme ?? 'light'].background

  const handleOrganizationSwitch = React.useCallback(
    async (selectedOrgId: string) => {
      if (!selectedOrgId || selectedOrgId === activeOrgId) return

      setOrgError(null)
      setSwitchingOrgId(selectedOrgId)
      try {
        await setActiveOrganization({ organizationId: selectedOrgId as never })
        resetApp()
        router.replace('/')
      } catch (error) {
        console.error('Failed to switch organization', error)
        setOrgError(
          'No se pudo cambiar de organización. Verifica tu conexión e intenta nuevamente.'
        )
      } finally {
        setSwitchingOrgId(null)
      }
    },
    [activeOrgId, resetApp, router, setActiveOrganization]
  )

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

        {isLoaded && hasMultipleOrganizations ? (
          <View style={styles.orgSection}>
            <Text
              style={[
                styles.orgSectionTitle,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Cambiar organización
            </Text>
            {orgError ? (
              <Text style={styles.orgErrorText}>{orgError}</Text>
            ) : null}
            {memberships.map((membership, index) => {
              const membershipOrgId = membership.organizationId
              const isCurrent = membershipOrgId === activeOrgId
              const isSwitching = switchingOrgId === membershipOrgId

              return (
                <ThemedPressable
                  key={`${membershipOrgId}-${index}`}
                  type="secondary"
                  lightColor={buttonBg}
                  darkColor={buttonBg}
                  style={styles.orgButton}
                  onPress={() => handleOrganizationSwitch(membershipOrgId)}
                  disabled={!membershipOrgId || isCurrent || !!switchingOrgId}
                >
                  <Text
                    style={[
                      styles.orgButtonText,
                      { color: isDark ? '#fff' : '#000' },
                    ]}
                  >
                    {membership.organizationName}
                    {isCurrent ? ' (actual)' : ''}
                    {isSwitching ? '...' : ''}
                  </Text>
                </ThemedPressable>
              )
            })}
          </View>
        ) : null}

        <ThemedPressable
          type="secondary"
          lightColor={buttonBg}
          darkColor={buttonBg}
          style={[styles.button, { marginTop: 32, backgroundColor: '#ef4444' }]}
          onPress={async () => {
            router.back()
            await signOut()
          }}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}>
            Cerrar sesión
          </Text>
        </ThemedPressable>
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
  orgSection: {
    width: '100%',
    marginTop: 24,
    gap: 10,
  },
  orgSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  orgErrorText: {
    color: '#ef4444',
    fontSize: 13,
  },
  orgButton: {
    height: 44,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgButtonText: {
    fontSize: 14,
    fontWeight: '500',
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
