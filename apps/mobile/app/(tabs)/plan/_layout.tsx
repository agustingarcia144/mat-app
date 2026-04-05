import { Stack } from 'expo-router'
import HeaderBackButton from '@/components/ui/header-back-button'

export default function PlanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="upload-proof"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: 'Subir comprobante',
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="payment-history"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: 'Historial de pagos',
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  )
}
