import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useOrganizationList } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/themed-pressable'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  trainer: 'Entrenador',
  member: 'Miembro',
}

export default function SelectOrganizationScreen() {
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: true,
  })
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [loading, setLoading] = useState(false)

  const handleSelectOrg = useCallback(
    async (orgId: string) => {
      setLoading(true)
      try {
        await setActive?.({ organization: orgId } as any)
        router.replace('/(tabs)/home')
      } catch (err) {
        console.error('Error setting active organization:', err)
        setLoading(false)
      }
    },
    [router, setActive]
  )

  useEffect(() => {
    if (isLoaded && userMemberships) {
      // If user has only one organization, auto-select it
      if (userMemberships.data.length === 1) {
        handleSelectOrg(userMemberships.data[0].organization.id)
      }
    }
  }, [isLoaded, userMemberships, handleSelectOrg])

  if (!isLoaded || loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? '#000' : '#fff' },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </View>
    )
  }

  if (!userMemberships || userMemberships.data.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? '#000' : '#fff' },
        ]}
      >
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          No se encontraron organizaciones
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          Necesitas ser invitado a una organización
        </Text>
      </View>
    )
  }

  return (
    <View
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          Seleccionar organización
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          Elige a qué organización acceder
        </Text>

        <FlatList
          data={userMemberships.data}
          keyExtractor={(item) => item.organization?.id ?? ''}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[
                styles.orgCard,
                { borderColor: isDark ? '#27272a' : '#e4e4e7' },
              ]}
              onPress={() => handleSelectOrg(item.organization?.id ?? '')}
            >
              <View style={styles.orgInfo}>
                <Text
                  style={[styles.orgName, { color: isDark ? '#fff' : '#000' }]}
                >
                  {item.organization?.name ?? ''}
                </Text>
                {item.organization?.slug && (
                  <Text
                    style={[
                      styles.orgSlug,
                      { color: isDark ? '#71717a' : '#a1a1aa' },
                    ]}
                  >
                    {item.organization?.slug ?? ''}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.roleText,
                  { color: isDark ? '#a1a1aa' : '#71717a' },
                ]}
              >
                {ROLE_LABELS[item.role ?? ''] ?? item.role ?? ''}
              </Text>
            </ThemedPressable>
          )}
        />
      </View>
    </View>
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
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  list: {
    gap: 12,
  },
  orgCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  orgSlug: {
    fontSize: 14,
  },
  roleText: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
})
