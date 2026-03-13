import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { useRouter } from 'expo-router'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { EmptyState } from '@/components/ui/empty-state'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { useAppReset } from '@/components/providers/providers'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  trainer: 'Entrenador',
  member: 'Miembro',
}

export default function SelectOrganizationScreen() {
  const organizations = useQuery(api.organizationMemberships.getMyOrganizations)
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization
  )
  const router = useRouter()
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization
  )
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { resetApp } = useAppReset()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSelectedOrgId, setLastSelectedOrgId] = useState<string | null>(null)
  const hasAttemptedAutoSelect = useRef(false)
  const isLoaded = organizations !== undefined && currentMembership !== undefined
  const validOrganizations = React.useMemo(
    () =>
      (organizations ?? []).filter(
        (organization) =>
          typeof organization.organizationId === 'string' &&
          organization.organizationId.length > 0
      ),
    [organizations]
  )

  const handleSelectOrg = useCallback(
    async (organizationId: string) => {
      if (!organizationId) {
        setError('No se pudo identificar la organización seleccionada.')
        return
      }

      setLoading(true)
      setError(null)
      setLastSelectedOrgId(organizationId)
      try {
        await setActiveOrganization({
          organizationId: organizationId as never,
        })
        resetApp()
        router.replace('/')
      } catch (err) {
        console.error('Error setting active organization:', err)
        setError(
          'No pudimos cambiar de organización. Revisa tu conexión e intenta nuevamente.'
        )
      } finally {
        setLoading(false)
      }
    },
    [resetApp, router, setActiveOrganization]
  )

  useEffect(() => {
    if (isLoaded && !hasAttemptedAutoSelect.current) {
      // If user has only one organization, auto-select it
      if (validOrganizations.length === 1) {
        const onlyOrganizationId = validOrganizations[0].organizationId
        hasAttemptedAutoSelect.current = true
        if (onlyOrganizationId) {
          handleSelectOrg(onlyOrganizationId)
        }
      }
    }
  }, [handleSelectOrg, isLoaded, validOrganizations])

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

  if (validOrganizations.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: isDark ? '#000' : '#fff' },
        ]}
      >
        <EmptyState
          title="No se encontraron organizaciones"
          description="Necesitas ser invitado a una organización"
        />
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
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {lastSelectedOrgId ? (
              <ThemedPressable
                type="secondary"
                lightColor="#e4e4e7"
                darkColor="#27272a"
                style={styles.retryButton}
                onPress={() => handleSelectOrg(lastSelectedOrgId)}
              >
                <Text style={{ color: isDark ? '#fff' : '#000' }}>Reintentar</Text>
              </ThemedPressable>
            ) : null}
          </View>
        ) : null}

        <FlatList
          data={validOrganizations}
          keyExtractor={(item, index) => `${item.organizationId}-${index}`}
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
              onPress={() => {
                if (item.organizationId) {
                  void handleSelectOrg(item.organizationId)
                }
              }}
            >
              <View style={styles.orgInfo}>
                <Text
                  style={[styles.orgName, { color: isDark ? '#fff' : '#000' }]}
                >
                  {item.organizationName ?? ''}
                </Text>
                {item.organizationSlug && (
                  <Text
                    style={[
                      styles.orgSlug,
                      { color: isDark ? '#71717a' : '#a1a1aa' },
                    ]}
                  >
                    {item.organizationSlug ?? ''}
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
  errorContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
