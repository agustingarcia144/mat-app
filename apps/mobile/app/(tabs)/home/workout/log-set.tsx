import React, { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Switch,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Picker } from '@react-native-picker/picker'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { Colors } from '@/constants/theme'
import { invokeLogSetSaveCallback } from '@/lib/log-set-bridge'

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
  const { width: screenWidth } = useWindowDimensions()
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
  const [applyToAllSets, setApplyToAllSets] = useState(false)
  const [emptyButComplete, setEmptyButComplete] = useState(false)

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
    const raw = typeof params.notes === 'string' ? params.notes : params.notes?.[0]
    const trimmed = raw?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : ''
  }, [params.notes])

  const [timeAmount, setTimeAmount] = useState(() => {
    if (!hasTime) return 30
    if (initialTimeSeconds > 0) {
      return Math.max(
        1,
        Math.min(60, Math.round(initialTimeSeconds / 60 || initialTimeSeconds))
      )
    }
    return 30
  })
  const [timeUnit, setTimeUnit] = useState<'seconds' | 'minutes'>(() => {
    if (!hasTime) return 'minutes'
    if (initialTimeSeconds > 0) {
      return initialTimeSeconds < 60 ? 'seconds' : 'minutes'
    }
    return 'seconds'
  })

  useEffect(() => {
    setReps(initialReps)
    setWeightKg(initialWeight)
    if (hasTime) {
      if (initialTimeSeconds > 0) {
        setTimeAmount(
          Math.max(
            1,
            Math.min(60, Math.round(initialTimeSeconds / 60 || initialTimeSeconds))
          )
        )
        setTimeUnit(initialTimeSeconds < 60 ? 'seconds' : 'minutes')
      } else {
        setTimeAmount(30)
        setTimeUnit('seconds')
      }
    }
  }, [
    params.dayExId,
    params.setIndex,
    initialReps,
    initialWeight,
    hasTime,
    initialTimeSeconds,
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
      if (emptyButComplete) {
        // Keep parity with reps/weight: empty complete logs zero values.
        timeSeconds = hasTime ? 0 : undefined
      } else if (hasTime && timeAmount > 0) {
        timeSeconds =
          timeUnit === 'seconds' ? timeAmount : timeAmount * 60
      } else {
        timeSeconds = undefined
      }
      const repsToSave = emptyButComplete ? 0 : reps
      const weightToSave = emptyButComplete ? 0 : weightKg
      invokeLogSetSaveCallback({
        dayExId,
        setIndex,
        reps: repsToSave,
        weight: weightToSave,
        applyToAllSets,
        timeSeconds,
      })
    }
    router.back()
  }

  const headerClearance = insets.top + 8

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.titleBlock, { paddingTop: headerClearance }]}>
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
        <View style={[styles.toggleRow, { marginBottom: 12 }]}>
          <Text style={[styles.toggleLabel, { color: textColor }]}>
            Marcar como completado
          </Text>
          <Switch
            value={emptyButComplete}
            onValueChange={setEmptyButComplete}
            trackColor={{
              false: isDark ? '#3f3f46' : '#e4e4e7',
              true: isDark ? '#3b82f6' : '#2563eb',
            }}
            thumbColor="#fff"
          />
        </View>
        {/* Tabs for Load vs Time */}
        {!emptyButComplete && hasTime && (
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

        {activeTab === 'load' &&
          (emptyButComplete ? (
            <View style={styles.placeholderWrapper}>
              <View style={styles.placeholderBox}>
                <Image
                  source={require('@/assets/images/mat-wolf.png')}
                  style={styles.placeholderImage}
                  resizeMode="contain"
                />
                <Text style={[styles.placeholderText, { color: mutedColor }]}>
                  Este set se marcará como completado sin registrar repeticiones
                  ni peso.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.pickerRow, { gap: pickerGap }]}>
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
                    itemStyle={
                      Platform.OS === 'ios' ? { color: pickerColor } : undefined
                    }
                    mode={Platform.OS === 'android' ? 'dropdown' : undefined}
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
                    itemStyle={
                      Platform.OS === 'ios' ? { color: pickerColor } : undefined
                    }
                    mode={Platform.OS === 'android' ? 'dropdown' : undefined}
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
            </View>
          ))}

        {hasTime &&
          activeTab === 'time' &&
          (emptyButComplete ? (
            <View style={styles.placeholderWrapper}>
              <View style={styles.placeholderBox}>
                <Image
                  source={require('@/assets/images/mat-wolf.png')}
                  style={styles.placeholderImage}
                  resizeMode="contain"
                />
                <Text style={[styles.placeholderText, { color: mutedColor }]}>
                  Este set se marcará como completado usando sólo el tiempo
                  prescripto.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.pickerRow, { gap: pickerGap }]}>
              <View
                style={[
                  styles.pickerBlock,
                  { width: pickerColumnWidth, maxWidth: pickerColumnWidth },
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
                    itemStyle={
                      Platform.OS === 'ios' ? { color: pickerColor } : undefined
                    }
                    mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                    prompt="Tiempo"
                  >
                    {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => (
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
                  Unidad
                </Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={timeUnit}
                    onValueChange={(v) =>
                      setTimeUnit(v === 'seconds' ? 'seconds' : 'minutes')
                    }
                    style={[styles.picker, { color: pickerColor }]}
                    itemStyle={
                      Platform.OS === 'ios' ? { color: pickerColor } : undefined
                    }
                    mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                    prompt="Unidad de tiempo"
                  >
                    <Picker.Item label="Segundos" value="seconds" />
                    <Picker.Item label="Minutos" value="minutes" />
                  </Picker>
                </View>
              </View>
            </View>
          ))}
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
            style={[styles.saveButtonText, { color: isDark ? '#000' : '#fff' }]}
          >
            Guardar
          </Text>
        </ThemedPressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    overflow: 'hidden',
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
    marginVertical: 20,
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
  placeholderWrapper: {
    minHeight: 295,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  placeholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
  },
  placeholderImage: {
    width: 140,
    height: 140,
    marginBottom: 12,
  },
})
