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
  TextInput,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
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
import { format, parseISO } from 'date-fns'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { Colors } from '@/constants/theme'
import LoadingScreen from '@/components/shared/screens/loading-screen'
import { useAppReset } from '@/components/providers/providers'
import { Picker } from '@react-native-picker/picker'

const HEIGHT_CM = Array.from({ length: 151 }, (_, i) => 100 + i)
const WEIGHT_KG = Array.from({ length: 171 }, (_, i) => 30 + i)

type PersonalInfoModalProps = {
  visible: boolean
  onClose: () => void
  isDark: boolean
  initialData: {
    firstName?: string
    lastName?: string
    nickname?: string
    birthday?: string
    phone?: string
  }
}

function PersonalInfoModal({
  visible,
  onClose,
  isDark,
  initialData,
}: PersonalInfoModalProps) {
  const insets = useSafeAreaInsets()
  const { user } = useUser()
  const updatePersonalInfo = useMutation(api.users.updatePersonalInfo)

  const [firstName, setFirstName] = React.useState(initialData.firstName ?? '')
  const [lastName, setLastName] = React.useState(initialData.lastName ?? '')
  const [nickname, setNickname] = React.useState(initialData.nickname ?? '')
  const [phone, setPhone] = React.useState(initialData.phone ?? '')
  const [birthdayDate, setBirthdayDate] = React.useState<Date | null>(() => {
    if (!initialData.birthday) return null
    try {
      return parseISO(initialData.birthday)
    } catch {
      return null
    }
  })
  const [showDatePicker, setShowDatePicker] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (visible) {
      setFirstName(initialData.firstName ?? '')
      setLastName(initialData.lastName ?? '')
      setNickname(initialData.nickname ?? '')
      setPhone(initialData.phone ?? '')
      setBirthdayDate(() => {
        if (!initialData.birthday) return null
        try {
          return parseISO(initialData.birthday)
        } catch {
          return null
        }
      })
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const displayBirthday = birthdayDate ? format(birthdayDate, 'dd/MM/yyyy') : ''

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([
        // Keep Clerk in sync for name fields (Clerk is auth source of truth;
        // its webhooks would otherwise overwrite Convex on next sync)
        user?.update({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
        updatePersonalInfo({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          nickname: nickname.trim() || undefined,
          birthday: birthdayDate
            ? format(birthdayDate, 'yyyy-MM-dd')
            : undefined,
          phone: phone.trim() || undefined,
        }),
      ])
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = [
    styles.settingInput,
    {
      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
      color: isDark ? '#fff' : '#000',
      borderColor: isDark ? '#27272a' : '#e4e4e7',
    },
  ]

  const labelStyle = [
    styles.settingInputLabel,
    { color: isDark ? '#a1a1aa' : '#71717a' },
  ]

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => !loading && onClose()}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.modalFlexBackdrop}
          onPress={() => !loading && onClose()}
        />
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: isDark ? '#000' : '#fff',
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
          >
            <ThemedText type="title" style={styles.modalTitle}>
              Información personal
            </ThemedText>

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Nombre</Text>
              <TextInput
                style={inputStyle}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Nombre"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                editable={!loading}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Apellido</Text>
              <TextInput
                style={inputStyle}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Apellido"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                editable={!loading}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Apodo</Text>
              <TextInput
                style={inputStyle}
                value={nickname}
                onChangeText={setNickname}
                placeholder="¿Cómo te gusta que te llamen?"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                editable={!loading}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Teléfono</Text>
              <TextInput
                style={inputStyle}
                value={phone}
                onChangeText={setPhone}
                placeholder="+54 11 1234-5678"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                editable={!loading}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Fecha de nacimiento</Text>
              <Pressable
                style={[inputStyle, { justifyContent: 'center' }]}
                onPress={() => !loading && setShowDatePicker(true)}
              >
                <Text
                  style={{
                    color: displayBirthday
                      ? isDark
                        ? '#fff'
                        : '#000'
                      : isDark
                        ? '#52525b'
                        : '#a1a1aa',
                    fontSize: 16,
                  }}
                >
                  {displayBirthday || 'DD/MM/AAAA'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.modalSaveButton,
                { backgroundColor: isDark ? '#fff' : '#000' },
                loading && { opacity: 0.5 },
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.modalSaveButtonText,
                    { color: isDark ? '#000' : '#fff' },
                  ]}
                >
                  Guardar
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {/* Date picker overlay — absolutely positioned inside the same Modal (nested Modal breaks on iOS) */}
      {showDatePicker && (
        <View style={styles.pickerOverlay}>
          <Pressable
            style={styles.modalFlexBackdrop}
            onPress={() => setShowDatePicker(false)}
          />
          <View
            style={[
              styles.pickerSheet,
              {
                backgroundColor: isDark ? '#1c1c1e' : '#fff',
                paddingBottom: Math.max(insets.bottom + 16, 32),
              },
            ]}
          >
            <Text
              style={[
                styles.pickerSheetTitle,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Fecha de nacimiento
            </Text>
            <DateTimePicker
              value={birthdayDate ?? new Date(2000, 0, 1)}
              mode="date"
              display="spinner"
              onChange={(_event, selectedDate) => {
                if (Platform.OS === 'android') setShowDatePicker(false)
                if (selectedDate) setBirthdayDate(selectedDate)
              }}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              locale="es-ES"
              style={{ width: '100%' }}
            />
            <Pressable
              onPress={() => setShowDatePicker(false)}
              hitSlop={12}
              style={styles.pickerSheetDoneInline}
            >
              <Text
                style={[
                  styles.pickerSheetDoneText,
                  { color: isDark ? '#fff' : '#000' },
                ]}
              >
                Listo
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </Modal>
  )
}

type PhysicalInfoModalProps = {
  visible: boolean
  onClose: () => void
  isDark: boolean
  initialData: {
    height?: number
    weight?: number
    description?: string
  }
}

function PhysicalInfoModal({
  visible,
  onClose,
  isDark,
  initialData,
}: PhysicalInfoModalProps) {
  const insets = useSafeAreaInsets()
  const updatePhysicalInfo = useMutation(api.users.updatePhysicalInfo)

  const [heightCm, setHeightCm] = React.useState<number>(
    initialData.height ?? HEIGHT_CM[50]
  )
  const [weightKg, setWeightKg] = React.useState<number>(
    initialData.weight ?? WEIGHT_KG[40]
  )
  const [heightText, setHeightText] = React.useState(
    String(initialData.height ?? HEIGHT_CM[50])
  )
  const [weightText, setWeightText] = React.useState(
    String(initialData.weight ?? WEIGHT_KG[40])
  )
  const [description, setDescription] = React.useState(
    initialData.description ?? ''
  )
  const [activePicker, setActivePicker] = React.useState<
    'height' | 'weight' | null
  >(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (visible) {
      const h = initialData.height ?? HEIGHT_CM[50]
      const w = initialData.weight ?? WEIGHT_KG[40]
      setHeightCm(h)
      setWeightKg(w)
      setHeightText(String(h))
      setWeightText(String(w))
      setDescription(initialData.description ?? '')
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      await updatePhysicalInfo({
        height: heightCm,
        weight: weightKg,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const labelStyle = [
    styles.settingInputLabel,
    { color: isDark ? '#a1a1aa' : '#71717a' },
  ]
  const pickerInputStyle = [
    styles.settingInput,
    {
      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
      borderColor: isDark ? '#27272a' : '#e4e4e7',
      justifyContent: 'center' as const,
    },
  ]

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => !loading && !activePicker && onClose()}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.modalFlexBackdrop}
          onPress={() => !loading && !activePicker && onClose()}
        />
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: isDark ? '#000' : '#fff',
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
          >
            <ThemedText type="title" style={styles.modalTitle}>
              Información física
            </ThemedText>

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Altura (cm)</Text>
              {Platform.OS === 'android' ? (
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                      color: isDark ? '#fff' : '#000',
                      borderColor: isDark ? '#27272a' : '#e4e4e7',
                    },
                  ]}
                  keyboardType="number-pad"
                  value={heightText}
                  onChangeText={setHeightText}
                  onBlur={() => {
                    const n = parseInt(heightText, 10)
                    const clamped = isNaN(n) ? HEIGHT_CM[50] : Math.min(250, Math.max(100, n))
                    setHeightCm(clamped)
                    setHeightText(String(clamped))
                  }}
                  editable={!loading}
                />
              ) : (
                <Pressable
                  style={pickerInputStyle}
                  onPress={() => !loading && setActivePicker('height')}
                >
                  <Text style={{ fontSize: 16, color: isDark ? '#fff' : '#000' }}>
                    {heightCm} cm
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Peso (kg)</Text>
              {Platform.OS === 'android' ? (
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                      color: isDark ? '#fff' : '#000',
                      borderColor: isDark ? '#27272a' : '#e4e4e7',
                    },
                  ]}
                  keyboardType="number-pad"
                  value={weightText}
                  onChangeText={setWeightText}
                  onBlur={() => {
                    const n = parseInt(weightText, 10)
                    const clamped = isNaN(n) ? WEIGHT_KG[40] : Math.min(200, Math.max(30, n))
                    setWeightKg(clamped)
                    setWeightText(String(clamped))
                  }}
                  editable={!loading}
                />
              ) : (
                <Pressable
                  style={pickerInputStyle}
                  onPress={() => !loading && setActivePicker('weight')}
                >
                  <Text style={{ fontSize: 16, color: isDark ? '#fff' : '#000' }}>
                    {weightKg} kg
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.settingInputGroup}>
              <Text style={labelStyle}>Notas para tu entrenador</Text>
              <TextInput
                style={[
                  styles.settingInput,
                  styles.settingTextArea,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    color: isDark ? '#fff' : '#000',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder="Objetivos, lesiones, notas..."
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>

            <Pressable
              style={[
                styles.modalSaveButton,
                { backgroundColor: isDark ? '#fff' : '#000' },
                loading && { opacity: 0.5 },
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.modalSaveButtonText,
                    { color: isDark ? '#000' : '#fff' },
                  ]}
                >
                  Guardar
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>

        {/* Picker overlay — iOS only (on Android we use inline TextInput) */}
        {Platform.OS === 'ios' && activePicker !== null && (
          <View style={styles.pickerOverlay}>
            <Pressable
              style={styles.modalFlexBackdrop}
              onPress={() => setActivePicker(null)}
            />
            <View
              style={[
                styles.pickerSheet,
                {
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  elevation: 24,
                  backgroundColor: isDark ? '#1c1c1e' : '#fff',
                  paddingBottom: Math.max(insets.bottom + 16, 32),
                },
              ]}
            >
              <Text
                style={[
                  styles.pickerSheetTitle,
                  { color: isDark ? '#fff' : '#000' },
                ]}
              >
                {activePicker === 'height' ? 'Altura (cm)' : 'Peso (kg)'}
              </Text>
              {activePicker === 'height' ? (
                <Picker
                  selectedValue={heightCm}
                  onValueChange={(v: number) => setHeightCm(v)}
                >
                  {HEIGHT_CM.map((cm: number) => (
                    <Picker.Item key={cm} label={`${cm} cm`} value={cm} />
                  ))}
                </Picker>
              ) : (
                <Picker
                  selectedValue={weightKg}
                  onValueChange={(v: number) => setWeightKg(v)}
                >
                  {WEIGHT_KG.map((kg: number) => (
                    <Picker.Item key={kg} label={`${kg} kg`} value={kg} />
                  ))}
                </Picker>
              )}
              <Pressable
                onPress={() => setActivePicker(null)}
                hitSlop={12}
                style={styles.pickerSheetDoneInline}
              >
                <Text
                  style={[
                    styles.pickerSheetDoneText,
                    { color: isDark ? '#fff' : '#000' },
                  ]}
                >
                  Listo
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

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
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.modalFlexBackdrop}
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
  const [personalInfoModalVisible, setPersonalInfoModalVisible] =
    React.useState(false)
  const [physicalInfoModalVisible, setPhysicalInfoModalVisible] =
    React.useState(false)

  const convexUser = useQuery(api.users.getCurrentUser)

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
            paddingTop: insets.top + (Platform.OS === 'android' ? 64 : 44),
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

        <View style={styles.settingsSection}>
          <Text
            style={[
              styles.settingsSectionTitle,
              { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)' },
            ]}
          >
            Ajustes
          </Text>
          <Pressable
            style={[styles.settingsRow, { backgroundColor: buttonBg }]}
            onPress={() => setPersonalInfoModalVisible(true)}
          >
            <Text
              style={[
                styles.settingsRowText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Información personal
            </Text>
            <Text
              style={[
                styles.settingsRowChevron,
                { color: isDark ? '#71717a' : '#a1a1aa' },
              ]}
            >
              ›
            </Text>
          </Pressable>
          <Pressable
            style={[styles.settingsRow, { backgroundColor: buttonBg }]}
            onPress={() => setPhysicalInfoModalVisible(true)}
          >
            <Text
              style={[
                styles.settingsRowText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Información física
            </Text>
            <Text
              style={[
                styles.settingsRowChevron,
                { color: isDark ? '#71717a' : '#a1a1aa' },
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>

        <ThemedPressable
          type="secondary"
          lightColor={buttonBg}
          darkColor={buttonBg}
          style={[styles.button, { marginTop: 16, backgroundColor: '#ef4444' }]}
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
            <Text
              style={[styles.deleteAccountButtonText, { color: '#ef4444' }]}
            >
              Eliminar cuenta permanentemente
            </Text>
          </ThemedPressable>
        </View>
      </ScrollView>

      <PersonalInfoModal
        visible={personalInfoModalVisible}
        onClose={() => setPersonalInfoModalVisible(false)}
        isDark={isDark}
        initialData={{
          firstName: convexUser?.firstName,
          lastName: convexUser?.lastName,
          nickname: convexUser?.nickname,
          birthday: convexUser?.birthday,
          phone: convexUser?.phone,
        }}
      />

      <PhysicalInfoModal
        visible={physicalInfoModalVisible}
        onClose={() => setPhysicalInfoModalVisible(false)}
        isDark={isDark}
        initialData={{
          height: convexUser?.height,
          weight: convexUser?.weight,
          description: currentMembership?.description,
        }}
      />

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
  settingsSection: {
    width: '100%',
    marginTop: 28,
    gap: 8,
  },
  settingsSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  settingsRow: {
    height: 48,
    borderRadius: 9999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingsRowChevron: {
    fontSize: 22,
    lineHeight: 24,
  },
  settingInput: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  settingTextArea: {
    borderRadius: 16,
    height: undefined,
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  settingInputGroup: {
    gap: 6,
  },
  settingInputLabel: {
    fontSize: 13,
    fontWeight: '500',
    paddingLeft: 4,
  },
  modalSaveButton: {
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerSheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 96,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  pickerSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  pickerSheetDone: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 50,
    elevation: 50,
  },
  pickerSheetDoneInline: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  pickerSheetDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Flex-based backdrop: fills space above the card without overlapping it.
  // Avoids Android touch-dispatch issues caused by absoluteFillObject + pointerEvents.
  modalFlexBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Same pattern for picker overlays inside modals.
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    justifyContent: 'flex-end',
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
