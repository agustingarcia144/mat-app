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
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'

export default function PlanSelector() {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const plans = useQuery(api.membershipPlans.getByOrganization, {
    activeOnly: true,
  })
  const activate = useMutation(api.memberPlanSubscriptions.activate)

  const handleActivate = (planId: string, planName: string) => {
    Alert.alert(
      'Activar plan',
      `¿Querés activar el plan "${planName}"? Deberás realizar la transferencia bancaria y subir el comprobante.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Activar',
          onPress: async () => {
            try {
              await activate({ planId: planId as any })
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Error al activar'
              )
            }
          },
        },
      ]
    )
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
            {plans.map((plan) => (
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
                    {plan.weeklyClassLimit >= 9999 ? 'Sin límite' : `${plan.weeklyClassLimit} clases por semana`}
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

                <ThemedPressable
                  type="primary"
                  style={styles.activateButton}
                  onPress={() => handleActivate(plan._id, plan.name)}
                >
                  <ThemedText
                    style={[
                      styles.activateText,
                      { color: isDark ? '#000' : '#fff' },
                    ]}
                  >
                    Activar plan
                  </ThemedText>
                </ThemedPressable>
              </View>
            ))}
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
  activateButton: {
    marginTop: 4,
  },
  activateText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
