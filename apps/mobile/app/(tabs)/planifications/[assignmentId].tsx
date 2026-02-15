import React from 'react'
import { ThemedView } from '@/components/ui/themed-view'
import { ActivityIndicator } from 'react-native'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Authenticated, AuthLoading } from 'convex/react'
import {
  AssignmentDetailContent,
  assignmentDetailStyles,
} from '@/components/features/planifications'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView
      style={[assignmentDetailStyles.container, assignmentDetailStyles.centered]}
    >
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

export default function AssignmentDetailScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <AssignmentDetailContent />
      </Authenticated>
    </>
  )
}
