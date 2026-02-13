import React, { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Picker } from '@react-native-picker/picker'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/themed-pressable'
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

export default function LogSetScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    dayExId?: string
    setIndex?: string
    reps?: string
    weight?: string
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

  const [reps, setReps] = useState(initialReps)
  const [weightKg, setWeightKg] = useState(initialWeight)
  const [applyToAllSets, setApplyToAllSets] = useState(false)

  useEffect(() => {
    setReps(initialReps)
    setWeightKg(initialWeight)
  }, [params.dayExId, params.setIndex, initialReps, initialWeight])

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
      invokeLogSetSaveCallback({
        dayExId,
        setIndex,
        reps,
        weight: weightKg,
        applyToAllSets,
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
      </View>

      <View
        style={[
          styles.content,
          {
            paddingHorizontal: contentPadding,
          },
        ]}
      >
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
        <View style={styles.toggleRow}>
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
})
