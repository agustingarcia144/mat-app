import React, { useState } from 'react'
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'

type AdvanceDiscount = { months: number; discountPercentage: number }

const MONTH_LABELS: Record<number, string> = {
  1: '1 mes',
  3: '3 meses',
  6: '6 meses',
  12: '12 meses (anual)',
}

export default function PlanSelector() {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const plans = useQuery(api.membershipPlans.getByOrganization, {
    activeOnly: true,
  })
  const activate = useMutation(api.memberPlanSubscriptions.activate)

  // Track selected advance months per plan
  const [selectedMonths, setSelectedMonths] = useState<
    Record<string, number>
  >({})

  const handleActivate = (
    planId: string,
    planName: string,
    priceArs: number,
    advanceMonths: number,
    discount?: AdvanceDiscount
  ) => {
    const discountedPrice = discount
      ? Math.round(priceArs * (1 - discount.discountPercentage / 100))
      : priceArs
    const totalPrice = discountedPrice * advanceMonths

    const message =
      advanceMonths > 1
        ? `¿Querés activar el plan "${planName}" pagando ${advanceMonths} meses por adelantado?\n\nPrecio por mes: $${discountedPrice.toLocaleString('es-AR')} (${discount!.discountPercentage}% dto.)\nTotal: $${totalPrice.toLocaleString('es-AR')}`
        : `¿Querés activar el plan "${planName}"? Deberás realizar la transferencia bancaria y subir el comprobante.`

    Alert.alert('Activar plan', message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Activar',
        onPress: async () => {
          try {
            await activate({
              planId: planId as any,
              advanceMonths: advanceMonths > 1 ? advanceMonths : undefined,
            })
          } catch (err) {
            Alert.alert(
              'Error',
              err instanceof Error ? err.message : 'Error al activar'
            )
          }
        },
      },
    ])
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
          Elegí tu plan
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Seleccioná un plan de membresía para acceder a las clases.
        </ThemedText>

        {plans === undefined ? (
          <ActivityIndicator
            size="large"
            color={isDark ? '#fff' : '#000'}
            style={styles.loader}
          />
        ) : plans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              No hay planes disponibles en este momento. Contactá al gimnasio
              para más información.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.plansList}>
            {plans.map((plan) => {
              const discounts = (plan.advancePaymentDiscounts ?? []) as AdvanceDiscount[]
              const hasDiscounts = discounts.length > 0
              const chosenMonths = selectedMonths[plan._id] ?? 1
              const chosenDiscount = discounts.find(
                (d) => d.months === chosenMonths
              )

              return (
                <View
                  key={plan._id}
                  style={[
                    styles.planCard,
                    { backgroundColor: isDark ? '#1c1c1e' : '#f5f5f5' },
                  ]}
                >
                  <View style={styles.planHeader}>
                    <Text
                      style={[
                        styles.planName,
                        { color: isDark ? '#fff' : '#000' },
                      ]}
                    >
                      {plan.name}
                    </Text>
                    <Text
                      style={[
                        styles.planPrice,
                        { color: isDark ? '#fff' : '#000' },
                      ]}
                    >
                      ${plan.priceArs.toLocaleString('es-AR')}
                      <Text style={styles.planPriceSuffix}>/mes</Text>
                    </Text>
                  </View>

                  {plan.description ? (
                    <Text
                      style={[
                        styles.planDescription,
                        { color: isDark ? '#aaa' : '#666' },
                      ]}
                    >
                      {plan.description}
                    </Text>
                  ) : null}

                  <View style={styles.planDetails}>
                    <Text
                      style={[
                        styles.planDetail,
                        { color: isDark ? '#ccc' : '#444' },
                      ]}
                    >
                      {plan.weeklyClassLimit >= 9999
                        ? 'Sin límite'
                        : `${plan.weeklyClassLimit} clases por semana`}
                    </Text>
                    <Text
                      style={[
                        styles.planDetail,
                        { color: isDark ? '#ccc' : '#444' },
                      ]}
                    >
                      Pago del {plan.paymentWindowStartDay} al{' '}
                      {plan.paymentWindowEndDay} de cada mes
                    </Text>
                  </View>

                  {/* Advance payment options */}
                  {hasDiscounts && (
                    <View style={styles.discountSection}>
                      <Text
                        style={[
                          styles.discountLabel,
                          { color: isDark ? '#ccc' : '#444' },
                        ]}
                      >
                        Pagá por adelantado y ahorrá:
                      </Text>
                      <View style={styles.discountOptions}>
                        {/* Monthly (no discount) option */}
                        <Pressable
                          style={[
                            styles.discountChip,
                            {
                              backgroundColor:
                                chosenMonths === 1
                                  ? isDark
                                    ? '#fff'
                                    : '#000'
                                  : isDark
                                    ? '#333'
                                    : '#e5e5e5',
                            },
                          ]}
                          onPress={() =>
                            setSelectedMonths((prev) => ({
                              ...prev,
                              [plan._id]: 1,
                            }))
                          }
                        >
                          <Text
                            style={[
                              styles.discountChipText,
                              {
                                color:
                                  chosenMonths === 1
                                    ? isDark
                                      ? '#000'
                                      : '#fff'
                                    : isDark
                                      ? '#ccc'
                                      : '#444',
                              },
                            ]}
                          >
                            1 mes
                          </Text>
                        </Pressable>

                        {discounts
                          .sort((a, b) => a.months - b.months)
                          .map((discount) => {
                            const isSelected =
                              chosenMonths === discount.months
                            return (
                              <Pressable
                                key={discount.months}
                                style={[
                                  styles.discountChip,
                                  {
                                    backgroundColor: isSelected
                                      ? isDark
                                        ? '#fff'
                                        : '#000'
                                      : isDark
                                        ? '#333'
                                        : '#e5e5e5',
                                  },
                                ]}
                                onPress={() =>
                                  setSelectedMonths((prev) => ({
                                    ...prev,
                                    [plan._id]: discount.months,
                                  }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.discountChipText,
                                    {
                                      color: isSelected
                                        ? isDark
                                          ? '#000'
                                          : '#fff'
                                        : isDark
                                          ? '#ccc'
                                          : '#444',
                                    },
                                  ]}
                                >
                                  {MONTH_LABELS[discount.months] ??
                                    `${discount.months} meses`}
                                </Text>
                                <Text
                                  style={[
                                    styles.discountChipBadge,
                                    {
                                      color: isSelected
                                        ? isDark
                                          ? '#166534'
                                          : '#22c55e'
                                        : '#22c55e',
                                    },
                                  ]}
                                >
                                  -{discount.discountPercentage}%
                                </Text>
                              </Pressable>
                            )
                          })}
                      </View>

                      {/* Price summary for selected option */}
                      {chosenDiscount && (
                        <View style={styles.discountSummary}>
                          <Text
                            style={[
                              styles.discountSummaryText,
                              { color: isDark ? '#aaa' : '#666' },
                            ]}
                          >
                            $
                            {Math.round(
                              plan.priceArs *
                                (1 - chosenDiscount.discountPercentage / 100)
                            ).toLocaleString('es-AR')}
                            /mes
                            {'  ·  '}
                            Total: $
                            {(
                              Math.round(
                                plan.priceArs *
                                  (1 -
                                    chosenDiscount.discountPercentage / 100)
                              ) * chosenDiscount.months
                            ).toLocaleString('es-AR')}
                          </Text>
                          <Text style={styles.savingsText}>
                            Ahorrás $
                            {(
                              plan.priceArs * chosenDiscount.months -
                              Math.round(
                                plan.priceArs *
                                  (1 -
                                    chosenDiscount.discountPercentage / 100)
                              ) *
                                chosenDiscount.months
                            ).toLocaleString('es-AR')}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <ThemedPressable
                    type="primary"
                    style={styles.activateButton}
                    onPress={() =>
                      handleActivate(
                        plan._id,
                        plan.name,
                        plan.priceArs,
                        chosenMonths,
                        chosenDiscount
                      )
                    }
                  >
                    <ThemedText
                      style={[
                        styles.activateText,
                        { color: isDark ? '#000' : '#fff' },
                      ]}
                    >
                      {chosenMonths > 1
                        ? `Activar plan (${chosenMonths} meses)`
                        : 'Activar plan'}
                    </ThemedText>
                  </ThemedPressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  title: {
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.6,
    marginBottom: 8,
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
  },
  plansList: {
    gap: 16,
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700',
  },
  planPriceSuffix: {
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.6,
  },
  planDescription: {
    fontSize: 14,
  },
  planDetails: {
    gap: 4,
  },
  planDetail: {
    fontSize: 14,
  },
  discountSection: {
    gap: 8,
  },
  discountLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  discountOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  discountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  discountChipBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  discountSummary: {
    gap: 2,
  },
  discountSummaryText: {
    fontSize: 13,
  },
  savingsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
  },
  activateButton: {
    marginTop: 4,
  },
  activateText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
