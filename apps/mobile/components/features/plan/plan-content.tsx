import React from 'react'
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import PlanSelector from './plan-selector'
import PlanStatusCard from './plan-status-card'
import PaymentStatusCard from './payment-status-card'

export default function PlanContent() {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const router = useRouter()

  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription)
  const weeklyCount = useQuery(api.classReservations.getMyWeeklyClassCount)
  const currentPayment = useQuery(api.planPayments.getMyCurrentPeriodPayment)
  const cancelSubscription = useMutation(api.memberPlanSubscriptions.cancel)

  const handleCancel = () => {
    Alert.alert(
      'Cancelar plan',
      '¿Estás seguro de que querés cancelar tu plan? Perderás el acceso a las clases.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription({})
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Error al cancelar'
              )
            }
          },
        },
      ]
    )
  }

  if (subscription === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  // No subscription — show plan selector
  if (!subscription) {
    return <PlanSelector />
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Mi Plan
        </ThemedText>

        {/* Plan info + weekly count */}
        <PlanStatusCard
          plan={subscription.plan}
          status={subscription.status}
          weeklyUsed={weeklyCount?.used ?? 0}
          weeklyLimit={weeklyCount?.limit ?? 0}
        />

        {/* Current period payment */}
        <PaymentStatusCard
          payment={currentPayment}
          onUploadPress={() =>
            router.push({
              pathname: '/(tabs)/plan/upload-proof',
              params: { paymentId: currentPayment?._id ?? '' },
            })
          }
        />

        {/* Actions */}
        <View style={styles.actions}>
          <ThemedPressable
            type="secondary"
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/plan/payment-history')}
          >
            <Text
              style={[styles.actionText, { color: isDark ? '#fff' : '#000' }]}
            >
              Historial de pagos
            </Text>
          </ThemedPressable>

          <ThemedPressable
            type="destructive"
            style={styles.actionButton}
            onPress={handleCancel}
          >
            <ThemedText style={styles.destructiveText}>
              Cancelar plan
            </ThemedText>
          </ThemedPressable>
        </View>
      </ScrollView>
    </ThemedView>
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
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  title: {
    marginBottom: 4,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})
