import React from 'react'
import { Image, StyleSheet, Text as RNText, View } from 'react-native'
import { useHeaderHeight } from '@react-navigation/elements'
import {
  Button,
  Host,
  List,
  Section,
  Text,
} from '@expo/ui/swift-ui'
import {
  background as swiftBackground,
  font,
  foregroundStyle,
  ignoreSafeArea,
  listStyle,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers'
import type { ProfileNativeListProps } from './profile-native-list.types'

/**
 * Dark gray used as the screen background — slightly lighter than pure black
 * so the insetGrouped list cells (#2c2c2e) have visible contrast against it.
 */
const SCREEN_BG = '#111111'

/** White tint applied to every non-destructive Button so icons and labels are white. */
const WHITE_TINT = tint('#ffffff')

export function ProfileNativeList({
  profile,
  organizations,
  onOpenPlanifications,
  actions,
}: ProfileNativeListProps) {
  const headerHeight = useHeaderHeight()

  return (
    <View style={[styles.container, { backgroundColor: SCREEN_BG }]}>
      {/* Profile header — plain RN view so it has no SwiftUI list row background.
          paddingTop accounts for the transparent navigation bar. */}
      <View style={[styles.profileHeader, { paddingTop: headerHeight + 32 }]}>
        {profile.imageUrl ? (
          <Image
            source={{ uri: profile.imageUrl }}
            style={styles.avatar}
            accessibilityLabel="Avatar"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <RNText style={styles.avatarPlaceholderText}>
              {profile.initials}
            </RNText>
          </View>
        )}
        <RNText style={styles.profileTitle}>{profile.fullName}</RNText>
        {profile.primaryEmail ? (
          <RNText style={styles.profileSubtitle}>{profile.primaryEmail}</RNText>
        ) : null}
      </View>

      {/* SwiftUI List for the settings items.
          ignoreSafeArea removes the automatic top content inset the List would
          otherwise add for the navigation bar (which has already been handled
          by the profile header's paddingTop above). */}
      <Host
        style={styles.host}
        colorScheme="dark"
        useViewportSizeMeasurement
      >
        <List
          modifiers={[
            listStyle('insetGrouped'),
            scrollContentBackground('hidden'),
            swiftBackground(SCREEN_BG),
            ignoreSafeArea({ regions: 'container', edges: 'top' }),
          ]}
        >
          {/* Workout data */}
          <Section>
            <Button
              label="Planificaciones"
              systemImage="calendar"
              onPress={onOpenPlanifications}
              modifiers={[WHITE_TINT]}
            />
          </Section>

          {/* Organization switcher (only when the user belongs to multiple gyms) */}
          {organizations.isLoaded && organizations.hasMultipleOrganizations ? (
            <Section title="Cambiar organización">
              {organizations.orgError ? (
                <Text
                  modifiers={[font({ size: 14 }), foregroundStyle('#a1a1aa')]}
                >
                  {organizations.orgError}
                </Text>
              ) : null}
              {organizations.memberships.map((membership, index) => {
                const isCurrent =
                  membership.organizationId === organizations.activeOrgId
                const isSwitching =
                  membership.organizationId === organizations.switchingOrgId

                return (
                  <Button
                    key={`${membership.organizationId}-${index}`}
                    label={`${membership.organizationName}${isCurrent ? ' (actual)' : ''}${isSwitching ? '...' : ''}`}
                    systemImage={
                      isCurrent ? 'checkmark.circle.fill' : 'building.2'
                    }
                    onPress={
                      isCurrent || !!organizations.switchingOrgId
                        ? undefined
                        : () => organizations.onSwitch(membership.organizationId)
                    }
                    modifiers={[WHITE_TINT]}
                  />
                )
              })}
            </Section>
          ) : null}

          {/* User settings */}
          <Section title="Ajustes">
            <Button
              label="Información personal"
              systemImage="person.fill"
              onPress={actions.onEditPersonalInfo}
              modifiers={[WHITE_TINT]}
            />
            <Button
              label="Información física"
              systemImage="figure.run"
              onPress={actions.onEditPhysicalInfo}
              modifiers={[WHITE_TINT]}
            />
            <Button
              label="Mi credencial Wallet"
              systemImage="wallet.pass.fill"
              onPress={actions.onOpenWalletPass}
              modifiers={[WHITE_TINT]}
            />
          </Section>

          {/* Account */}
          <Section title="Cuenta">
            <Button
              label="Administrar cuenta"
              systemImage="person.badge.minus"
              onPress={actions.onManageAccount}
              modifiers={[WHITE_TINT]}
            />
            <Button
              label="Cerrar sesión"
              systemImage="rectangle.portrait.and.arrow.right"
              onPress={actions.onSignOut}
              modifiers={[WHITE_TINT]}
            />
          </Section>
        </List>
      </Host>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  host: {
    flex: 1,
  },
  /* Centered vertical layout — large avatar, then name, then email */
  profileHeader: {
    alignItems: 'center',
    paddingBottom: 24,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 4,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a9e8a',
    marginBottom: 4,
  },
  avatarPlaceholderText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  profileTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  profileSubtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
  },
})
