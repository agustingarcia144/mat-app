import React from 'react'
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'

const STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: 'Pendiente', color: '#f59e0b' },
  in_review: { label: 'En revisión', color: '#3b82f6' },
  approved: { label: 'Aprobado', color: '#22c55e' },
  declined: { label: 'Rechazado', color: '#ef4444' },
}

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split('-')
  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ]
  const monthIndex = parseInt(month!, 10) - 1
  return `${monthNames[monthIndex]} ${year}`
}

export default function PaymentHistoryContent() {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const payments = useQuery(api.planPayments.getMyPayments)

  if (payments === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (payments.length === 0) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <Text style={[styles.emptyText, { color: isDark ? '#aaa' : '#666' }]}>
          No hay pagos registrados.
        </Text>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <FlashList
        data={payments}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 16,
        }}
        renderItem={({ item }) => {
          const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: isDark ? '#1c1c1e' : '#f5f5f5' },
              ]}
            >
              <View style={styles.rowMain}>
                <Text
                  style={[
                    styles.period,
                    { color: isDark ? '#fff' : '#000' },
                  ]}
                >
                  {formatBillingPeriod(item.billingPeriod)}
                </Text>
                <Text
                  style={[
                    styles.amount,
                    { color: isDark ? '#ccc' : '#444' },
                  ]}
                >
                  ${item.amountArs.toLocaleString('es-AR')}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusInfo.color + '22' },
                ]}
              >
                <Text style={[styles.statusText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  emptyText: {
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  rowMain: {
    gap: 2,
  },
  period: {
    fontSize: 16,
    fontWeight: '600',
  },
  amount: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
})
