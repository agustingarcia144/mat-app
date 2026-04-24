import React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { ProfileNativeListProps } from './profile-native-list.types'

function ProfileHeader({
  profile,
  isDark,
}: Pick<ProfileNativeListProps, 'profile' | 'isDark'>) {
  return (
    <>
      <View style={styles.avatarRow}>
        {profile.imageUrl ? (
          <Image
            source={{ uri: profile.imageUrl }}
            style={styles.avatar}
            accessibilityLabel="Avatar"
          />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.08)',
              },
            ]}
          >
            <Text
              style={[
                styles.avatarPlaceholderText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              {profile.initials}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
        {profile.fullName}
      </Text>
      {profile.primaryEmail ? (
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          {profile.primaryEmail}
        </Text>
      ) : null}
    </>
  )
}

function Row({
  title,
  isDark,
  onPress,
  textColor,
  backgroundColor,
  showChevron = true,
}: {
  title: string
  isDark: boolean
  onPress?: () => void
  textColor?: string
  backgroundColor?: string
  showChevron?: boolean
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: backgroundColor ?? (isDark ? '#141414' : '#f4f4f5'),
          opacity: pressed && !!onPress ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
    >
      <Text
        style={[
          styles.rowText,
          { color: textColor ?? (isDark ? '#fff' : '#000') },
        ]}
      >
        {title}
      </Text>
      {onPress && showChevron ? (
        <Text
          style={[styles.chevron, { color: isDark ? '#71717a' : '#a1a1aa' }]}
        >
          ›
        </Text>
      ) : null}
    </Pressable>
  )
}

function SectionTitle({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text
      style={[styles.sectionTitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
    >
      {title}
    </Text>
  )
}

export function ProfileNativeList({
  isDark,
  backgroundColor,
  profile,
  organizations,
  onOpenPlanifications,
  actions,
}: ProfileNativeListProps) {
  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ProfileHeader profile={profile} isDark={isDark} />

      <View style={styles.section}>
        <Row
          title="Planificaciones"
          isDark={isDark}
          onPress={onOpenPlanifications}
        />
      </View>

      {organizations.isLoaded && organizations.hasMultipleOrganizations ? (
        <View style={styles.section}>
          <SectionTitle title="Cambiar organización" isDark={isDark} />
          {organizations.orgError ? (
            <Text
              style={[
                styles.sectionError,
                { color: isDark ? '#a1a1aa' : '#71717a' },
              ]}
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
              <Row
                key={`${membership.organizationId}-${index}`}
                title={`${membership.organizationName}${isCurrent ? ' (actual)' : ''}${isSwitching ? '...' : ''}`}
                isDark={isDark}
                onPress={
                  isCurrent || organizations.switchingOrgId
                    ? undefined
                    : () => organizations.onSwitch(membership.organizationId)
                }
              />
            )
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Ajustes" isDark={isDark} />
        <Row
          title="Información personal"
          isDark={isDark}
          onPress={actions.onEditPersonalInfo}
        />
        <Row
          title="Información física"
          isDark={isDark}
          onPress={actions.onEditPhysicalInfo}
        />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Cuenta" isDark={isDark} />
        <Row
          title="Administrar cuenta"
          isDark={isDark}
          onPress={actions.onManageAccount}
        />
        <Row
          title="Cerrar sesión"
          isDark={isDark}
          onPress={actions.onSignOut}
        />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 40,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    width: '100%',
    marginTop: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sectionError: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
  },
})
