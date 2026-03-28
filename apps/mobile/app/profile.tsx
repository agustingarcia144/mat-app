import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useUser, useClerk } from '@clerk/expo'
import {
  Authenticated,
  AuthLoading,
  useMutation,
  useQuery,
  useAction,
} from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { Colors } from '@/constants/theme'
import LoadingScreen from '@/components/shared/screens/loading-screen'
import { useAppReset } from '@/components/providers/providers'

type DeleteAccountModalProps = {
  visible: boolean
  onClose: () => void
  isDark: boolean
  modalSurfaceColor: string
  buttonBg: string
}

function DeleteAccountModal({
  visible,
  onClose,
  isDark,
  modalSurfaceColor,
  buttonBg,
}: DeleteAccountModalProps) {
  const { signOut } = useClerk()
  const deleteMyAccount = useAction(api.userDeletion.deleteMyAccount)
  const insets = useSafeAreaInsets()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) {
      setError(null)
      setPending(false)
    }
  }, [visible])

  const runDelete = React.useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      await deleteMyAccount({})
      await signOut()
      // Do not call router.replace here: it races the navigator and throws
      // "navigate before mounting Root Layout". Root _layout redirects unauthenticated
      // users from profile (inSettings) to `/` via useEffect.
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'No se pudo eliminar la cuenta.'
      setError(msg)
      Alert.alert('Error', msg)
    } finally {
      setPending(false)
    }
  }, [deleteMyAccount, signOut])

  const onPressDelete = React.useCallback(() => {
    Alert.alert(
      '¿Eliminar cuenta permanentemente?',
      'Se eliminarán tu cuenta de acceso y tus datos personales en la app. Si tienes una suscripción en App Store, cancélala en Ajustes > Apple ID > Suscripciones. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void runDelete()
          },
        },
      ]
    )
  }, [runDelete])

  const handleClose = React.useCallback(() => {
    if (!pending) onClose()
  }, [pending, onClose])

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalRoot} pointerEvents="box-none">
        <Pressable
          style={styles.modalBackdrop}
          onPress={handleClose}
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
        />
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: modalSurfaceColor,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHandleArea}>
            <View
              style={[
                styles.modalHandle,
                { backgroundColor: isDark ? '#555' : '#ccc' },
              ]}
            />
          </View>
          <ThemedText type="title" style={styles.modalTitle}>
            Eliminar cuenta
          </ThemedText>
          <ThemedText style={styles.modalBody}>
            Puedes eliminar tu cuenta de forma permanente. Perderás el acceso a
            tus gimnasios, entrenamientos y reservas asociados a esta cuenta.
          </ThemedText>
          {error ? (
            <Text style={styles.modalError} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <ThemedPressable
            type="secondary"
            lightColor="transparent"
            darkColor="transparent"
            disabled={pending}
            style={[
              styles.modalDeleteButton,
              {
                borderColor: '#ef4444',
                backgroundColor: 'transparent',
                opacity: pending ? 0.6 : 1,
              },
            ]}
            onPress={onPressDelete}
            accessibilityRole="button"
            accessibilityLabel="Eliminar mi cuenta permanentemente"
          >
            {pending ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={styles.modalDeleteButtonText}>
                Eliminar mi cuenta permanentemente
              </Text>
            )}
          </ThemedPressable>
          <ThemedPressable
            type="secondary"
            lightColor={buttonBg}
            darkColor={buttonBg}
            style={[styles.modalCancelButton, { marginTop: 12 }]}
            onPress={handleClose}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Text
              style={[
                styles.modalCancelButtonText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Volver
            </Text>
          </ThemedPressable>
        </View>
      </View>
    </Modal>
  )
}

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
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] =
    React.useState(false)

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
  const isLoaded =
    organizations !== undefined && currentMembership !== undefined

  const buttonBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'
  const backgroundColor = Colors[colorScheme ?? 'light'].background
  const modalSurfaceColor = Colors[colorScheme ?? 'light'].background

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
          {
            // Extra top padding on Android so avatar isn't cut off by the transparent header/title
            paddingTop:
              insets.top +
              (Platform.OS === 'android' ? 64 : 44),
          },
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

        <View style={styles.dangerSection} accessibilityRole="none">
          <Text
            style={[
              styles.dangerSectionTitle,
              { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)' },
            ]}
          >
            Zona peligrosa
          </Text>
          <ThemedPressable
            type="secondary"
            lightColor="transparent"
            darkColor="transparent"
            style={[
              styles.deleteAccountButton,
              {
                borderColor: '#ef4444',
                backgroundColor: 'transparent',
              },
            ]}
            onPress={() => setDeleteAccountModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Eliminar cuenta permanentemente"
          >
            <Text style={[styles.deleteAccountButtonText, { color: '#ef4444' }]}>
              Eliminar cuenta permanentemente
            </Text>
          </ThemedPressable>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteAccountModalVisible}
        onClose={() => setDeleteAccountModalVisible(false)}
        isDark={isDark}
        modalSurfaceColor={modalSurfaceColor}
        buttonBg={buttonBg}
      />
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
  dangerSection: {
    width: '100%',
    marginTop: 28,
    gap: 10,
  },
  dangerSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteAccountButton: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  deleteAccountButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 8,
    maxHeight: '88%',
  },
  modalHandleArea: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.9,
    marginBottom: 24,
  },
  modalError: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  modalDeleteButton: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  modalDeleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  modalCancelButton: {
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
})
