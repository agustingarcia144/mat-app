import React, { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Switch,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Picker } from '@react-native-picker/picker'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { Colors } from '@/constants/theme'
import { invokeLogSetSaveCallback } from '@/lib/log-set-bridge'

const androidInputStyles = StyleSheet.create({
  block: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
})

const REPS_MIN = 1
const REPS_MAX = 100
const REPS_OPTIONS = Array.from(
  { length: REPS_MAX - REPS_MIN + 1 },
  (_, i) => REPS_MIN + i
)

const WEIGHT_KG_MIN = 0
const WEIGHT_KG_MAX = 200
const WEIGHT_STEP = 0.5
const WEIGHT_OPTIONS = (() => {
  const opts: number[] = []
  for (let k = WEIGHT_KG_MIN; k <= WEIGHT_KG_MAX; k += WEIGHT_STEP) {
    opts.push(Number(k.toFixed(1)))
  }
  return opts
})()

const parseNum = (s: string | undefined, fallback: number): number => {
  if (s == null || s === '') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

const TAB_PADDING = 4

type TabId = 'load' | 'time'
type TimeUnit = 'seconds' | 'minutes'

const toTimePickerState = (
  rawTimeSeconds: number
): { amount: number; unit: TimeUnit } => {
  const safeSeconds = Math.max(0, Math.round(rawTimeSeconds))
  if (safeSeconds <= 0) return { amount: 30, unit: 'seconds' }
  if (safeSeconds < 60) return { amount: safeSeconds, unit: 'seconds' }
  if (safeSeconds % 60 === 0) {
    return {
      amount: Math.max(1, Math.min(60, safeSeconds / 60)),
      unit: 'minutes',
    }
  }
  return {
    amount: Math.max(1, Math.min(60, Math.round(safeSeconds / 60))),
    unit: 'minutes',
  }
}

export default function LogSetScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    dayExId?: string
    setIndex?: string
    reps?: string
    weight?: string
    timeSeconds?: string
    notes?: string
    supportsTime?: string
  }>()
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const colorScheme = useColorScheme()
  const contentPadding = 12
  const pickerGap = 8
  const pickerColumnWidth = Math.floor(
    (screenWidth - contentPadding * 2 - pickerGap) / 2
  )
  const isDark = colorScheme === 'dark'

  const initialReps = useMemo(
    () => Math.min(REPS_MAX, Math.max(REPS_MIN, parseNum(params.reps, 10))),
    [params.reps]
  )
  const initialWeight = useMemo(() => {
    const w = parseNum(params.weight, 20)
    const clamped = Math.min(
      WEIGHT_KG_MAX,
      Math.max(WEIGHT_KG_MIN, Math.round(w * 2) / 2)
    )
    return WEIGHT_OPTIONS.includes(clamped) ? clamped : 20
  }, [params.weight])

  const [activeTab, setActiveTab] = useState<TabId>('load')
  const [reps, setReps] = useState(initialReps)
  const [weightKg, setWeightKg] = useState(initialWeight)
  const [repsText, setRepsText] = useState(String(initialReps))
  const [weightText, setWeightText] = useState(String(initialWeight))
  const [applyToAllSets, setApplyToAllSets] = useState(false)

  const initialTimeSeconds = useMemo(
    () => Math.max(0, parseNum(params.timeSeconds, 0)),
    [params.timeSeconds]
  )
  const supportsTimeFromPlan = useMemo(() => {
    const raw =
      typeof params.supportsTime === 'string'
        ? params.supportsTime
        : params.supportsTime?.[0]
    return raw === '1' || raw === 'true'
  }, [params.supportsTime])
  const hasTime = supportsTimeFromPlan || initialTimeSeconds > 0
  const notesParam = useMemo(() => {
    const raw =
      typeof params.notes === 'string' ? params.notes : params.notes?.[0]
    const trimmed = raw?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : ''
  }, [params.notes])

  const initialTimePicker = useMemo(
    () => toTimePickerState(initialTimeSeconds),
    [initialTimeSeconds]
  )
  const [timeAmount, setTimeAmount] = useState(initialTimePicker.amount)
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(initialTimePicker.unit)
  const [timeAmountText, setTimeAmountText] = useState(String(initialTimePicker.amount))

  useEffect(() => {
    setReps(initialReps)
    setWeightKg(initialWeight)
    setRepsText(String(initialReps))
    setWeightText(String(initialWeight))
    if (hasTime) {
      setTimeAmount(initialTimePicker.amount)
      setTimeUnit(initialTimePicker.unit)
      setTimeAmountText(String(initialTimePicker.amount))
    }
  }, [
    params.dayExId,
    params.setIndex,
    initialReps,
    initialWeight,
    hasTime,
    initialTimePicker,
  ])

  const backgroundColor = Colors[colorScheme ?? 'light'].background
  const textColor = Colors[colorScheme ?? 'light'].text
  const mutedColor = isDark ? '#a1a1aa' : '#71717a'
  const pickerColor = isDark ? '#fff' : '#000'

  const handleLog = () => {
    const dayExId =
      typeof params.dayExId === 'string' ? params.dayExId : params.dayExId?.[0]
    const setIndexParam =
      typeof params.setIndex === 'string'
        ? params.setIndex
        : params.setIndex?.[0]
    const setIndex = setIndexParam != null ? Number(setIndexParam) : undefined
    if (dayExId != null && setIndex != null && Number.isFinite(setIndex)) {
      let timeSeconds: number | undefined
      if (hasTime && timeAmount > 0) {
        timeSeconds = timeUnit === 'seconds' ? timeAmount : timeAmount * 60
      } else {
        timeSeconds = undefined
      }
      invokeLogSetSaveCallback({
        dayExId,
        setIndex,
        reps,
        weight: weightKg,
        applyToAllSets,
        timeSeconds,
      })
    }
    router.back()
  }

  const headerClearance = insets.top + 8

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {Platform.OS === 'android' && (
        <Pressable
          style={[
            styles.sheetOverlay,
            {
              height: screenHeight * 0.25,
              backgroundColor: 'rgba(0,0,0,0.5)',
            },
          ]}
          onPress={() => router.back()}
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
        />
      )}
      <View
        style={[
          styles.sheetInner,
          { backgroundColor },
          Platform.OS === 'android' && {
            marginTop: screenHeight * 0.25,
            height: screenHeight * 0.75,
          },
        ]}
      >
        <View style={styles.mainContent}>
          <View style={[styles.titleBlock, { paddingTop: headerClearance }]}>
            {Platform.OS === 'android' && (
              <Pressable
                style={styles.closeButton}
                onPress={() => router.back()}
                hitSlop={12}
                accessibilityLabel="Cerrar"
              >
                <IconSymbol
                  name="xmark"
                  size={22}
                  color={isDark ? '#fff' : '#000'}
                />
              </Pressable>
            )}
            <Text style={[styles.title, { color: textColor }]}>Reps y peso</Text>
            <Text style={[styles.subtitle, { color: mutedColor }]}>
              Registrá repeticiones y peso en kg
            </Text>
            {notesParam ? (
              <Text style={[styles.commentsText, { color: mutedColor }]}>
                Comentarios: {notesParam}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.content,
              {
                paddingHorizontal: contentPadding,
              },
            ]}
          >
            {/* Tabs for Load vs Time */}
            {hasTime && (
              <View
                style={[
                  styles.tabs,
                  {
                    backgroundColor: isDark ? '#171717' : '#f4f4f5',
                    borderColor: isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: isDark ? '#27272a' : '#ffffff',
                      left: activeTab === 'load' ? TAB_PADDING : undefined,
                      right: activeTab === 'time' ? TAB_PADDING : undefined,
                    },
                  ]}
                />
                <View style={styles.tabButtons}>
                  <View style={styles.tabButton}>
                    <Text
                      onPress={() => setActiveTab('load')}
                      style={[
                        styles.tabText,
                        {
                          color:
                            activeTab === 'load'
                              ? isDark
                                ? '#fafafa'
                                : '#18181b'
                              : isDark
                                ? '#a1a1aa'
                                : '#71717a',
                        },
                      ]}
                    >
                      Reps y peso
                    </Text>
                  </View>
                  {hasTime && (
                    <View style={styles.tabButton}>
                      <Text
                        onPress={() => setActiveTab('time')}
                        style={[
                          styles.tabText,
                          {
                            color:
                              activeTab === 'time'
                                ? isDark
                                  ? '#fafafa'
                                  : '#18181b'
                                : isDark
                                  ? '#a1a1aa'
                                  : '#71717a',
                          },
                        ]}
                      >
                        Tiempo
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {activeTab === 'load' && (
              <View style={[styles.pickerRow, { gap: pickerGap }]}>
                {Platform.OS === 'android' ? (
                  <>
                    <View style={androidInputStyles.block}>
                      <Text style={[androidInputStyles.label, { color: mutedColor }]}>
                        Repeticiones
                      </Text>
                      <TextInput
                        style={[
                          androidInputStyles.input,
                          {
                            backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5',
                            color: isDark ? '#fafafa' : '#18181b',
                          },
                        ]}
                        keyboardType="number-pad"
                        value={repsText}
                        onChangeText={setRepsText}
                        onBlur={() => {
                          const n = parseInt(repsText, 10)
                          const clamped = isNaN(n) ? REPS_MIN : Math.min(REPS_MAX, Math.max(REPS_MIN, n))
                          setReps(clamped)
                          setRepsText(String(clamped))
                        }}
                        selectTextOnFocus
                      />
                    </View>
                    <View style={androidInputStyles.block}>
                      <Text style={[androidInputStyles.label, { color: mutedColor }]}>
                        Peso (kg)
                      </Text>
                      <TextInput
                        style={[
                          androidInputStyles.input,
                          {
                            backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5',
                            color: isDark ? '#fafafa' : '#18181b',
                          },
                        ]}
                        keyboardType="decimal-pad"
                        value={weightText}
                        onChangeText={setWeightText}
                        onBlur={() => {
                          const n = parseFloat(weightText)
                          const snapped = isNaN(n) ? WEIGHT_KG_MIN : Math.round(n * 2) / 2
                          const clamped = Math.min(WEIGHT_KG_MAX, Math.max(WEIGHT_KG_MIN, snapped))
                          setWeightKg(clamped)
                          setWeightText(String(clamped))
                        }}
                        selectTextOnFocus
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View
                      style={[
                        styles.pickerBlock,
                        { width: pickerColumnWidth, maxWidth: pickerColumnWidth },
                      ]}
                    >
                      <Text style={[styles.pickerLabel, { color: mutedColor }]}>
                        Repeticiones
                      </Text>
                      <View style={styles.pickerWrap}>
                        <Picker
                          selectedValue={reps}
                          onValueChange={(v) => setReps(Number(v))}
                          style={[styles.picker, { color: pickerColor }]}
                          itemStyle={{ color: pickerColor }}
                          prompt="Repeticiones"
                        >
                          {REPS_OPTIONS.map((n) => (
                            <Picker.Item key={n} label={String(n)} value={n} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.pickerBlock,
                        { width: pickerColumnWidth, maxWidth: pickerColumnWidth },
                      ]}
                    >
                      <Text style={[styles.pickerLabel, { color: mutedColor }]}>
                        Peso (kg)
                      </Text>
                      <View style={styles.pickerWrap}>
                        <Picker
                          selectedValue={weightKg}
                          onValueChange={(v) => setWeightKg(Number(v))}
                          style={[styles.picker, { color: pickerColor }]}
                          itemStyle={{ color: pickerColor }}
                          prompt="Peso en kilos"
                        >
                          {WEIGHT_OPTIONS.map((n) => (
                            <Picker.Item
                              key={n}
                              label={n % 1 === 0 ? `${n}.0` : String(n)}
                              value={n}
                            />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}

            {hasTime && activeTab === 'time' && (
              <View style={[styles.pickerRow, { gap: pickerGap }]}>
                {Platform.OS === 'android' ? (
                  <>
                    <View style={androidInputStyles.block}>
                      <Text style={[androidInputStyles.label, { color: mutedColor }]}>
                        Tiempo
                      </Text>
                      <TextInput
                        style={[
                          androidInputStyles.input,
                          {
                            backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5',
                            color: isDark ? '#fafafa' : '#18181b',
                          },
                        ]}
                        keyboardType="number-pad"
                        value={timeAmountText}
                        onChangeText={setTimeAmountText}
                        onBlur={() => {
                          const n = parseInt(timeAmountText, 10)
                          const clamped = isNaN(n) ? 1 : Math.min(60, Math.max(1, n))
                          setTimeAmount(clamped)
                          setTimeAmountText(String(clamped))
                        }}
                        selectTextOnFocus
                      />
                    </View>
                    <View style={androidInputStyles.block}>
                      <Text style={[androidInputStyles.label, { color: mutedColor }]}>
                        Unidad
                      </Text>
                      <Pressable
                        style={[
                          androidInputStyles.input,
                          {
                            backgroundColor: isDark ? '#1c1c1e' : '#f4f4f5',
                            justifyContent: 'center',
                          },
                        ]}
                        onPress={() =>
                          setTimeUnit((u) =>
                            u === 'seconds' ? 'minutes' : 'seconds'
                          )
                        }
                      >
                        <Text
                          style={[
                            androidInputStyles.toggleText,
                            { color: isDark ? '#fafafa' : '#18181b' },
                          ]}
                        >
                          {timeUnit === 'seconds' ? 'Segundos' : 'Minutos'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View
                      style={[
                        styles.pickerBlock,
                        {
                          width: pickerColumnWidth,
                          maxWidth: pickerColumnWidth,
                        },
                      ]}
                    >
                      <Text style={[styles.pickerLabel, { color: mutedColor }]}>
                        Tiempo
                      </Text>
                      <View style={styles.pickerWrap}>
                        <Picker
                          selectedValue={timeAmount}
                          onValueChange={(v) => setTimeAmount(Number(v))}
                          style={[styles.picker, { color: pickerColor }]}
                          itemStyle={{ color: pickerColor }}
                          prompt="Tiempo"
                        >
                          {Array.from({ length: 60 }, (_, i) => i + 1).map(
                            (n) => (
                              <Picker.Item key={n} label={String(n)} value={n} />
                            )
                          )}
                        </Picker>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.pickerBlock,
                        {
                          width: pickerColumnWidth,
                          maxWidth: pickerColumnWidth,
                        },
                      ]}
                    >
                      <Text style={[styles.pickerLabel, { color: mutedColor }]}>
                        Unidad
                      </Text>
                      <View style={styles.pickerWrap}>
                        <Picker
                          selectedValue={timeUnit}
                          onValueChange={(v) =>
                            setTimeUnit(v === 'seconds' ? 'seconds' : 'minutes')
                          }
                          style={[styles.picker, { color: pickerColor }]}
                          itemStyle={{ color: pickerColor }}
                          prompt="Unidad de tiempo"
                        >
                          <Picker.Item label="Segundos" value="seconds" />
                          <Picker.Item label="Minutos" value="minutes" />
                        </Picker>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
            <View style={[styles.toggleRow, { marginTop: 16 }]}>
              <Text style={[styles.toggleLabel, { color: textColor }]}>
                Aplicar a todos los sets del ejercicio
              </Text>
              <Switch
                value={applyToAllSets}
                onValueChange={setApplyToAllSets}
                trackColor={{
                  false: isDark ? '#3f3f46' : '#e4e4e7',
                  true: isDark ? '#3b82f6' : '#2563eb',
                }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <ThemedPressable
            onPress={handleLog}
            lightColor="#000"
            darkColor="#fff"
            style={styles.saveButton}
          >
            <Text
              style={[
                styles.saveButtonText,
                { color: isDark ? '#000' : '#fff' },
              ]}
            >
              Guardar
            </Text>
          </ThemedPressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  sheetInner: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 24,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  commentsText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    paddingBottom: 16,
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
  },
  pickerBlock: {
    overflow: 'hidden',
  },
  pickerWrap: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  picker: {
    width: '100%',
    maxWidth: '100%',
    ...(Platform.OS === 'android' && {
      height: 160,
    }),
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  footer: {
    paddingTop: 8,
    alignSelf: 'stretch',
    marginTop: 12,
    paddingHorizontal: 24,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  tabs: {
    marginBottom: 20,
    marginHorizontal: 12,
    borderRadius: 9999,
    paddingVertical: TAB_PADDING + 4,
    paddingHorizontal: TAB_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  tabPill: {
    position: 'absolute',
    top: TAB_PADDING,
    bottom: TAB_PADDING,
    width: '48%',
    borderRadius: 9999,
  },
  tabButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
})
