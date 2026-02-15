import { StyleSheet } from 'react-native'
import { SPACING } from './constants'

export const assignmentDetailStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
  },
  hero: {
    marginBottom: SPACING.xxl,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  heroMeta: {
    marginBottom: SPACING.sm,
  },
  heroMetaText: {
    fontSize: 15,
    fontWeight: '500',
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: SPACING.xl,
  },
  sectionHeader: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  weekBlock: {
    gap: SPACING.md,
  },
  dayCardList: {
    gap: SPACING.md,
  },
  dayCard: {
    padding: SPACING.lg,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  dayName: {
    fontSize: 17,
    fontWeight: '600',
  },
  dayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayMeta: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  noExercises: {
    fontSize: 14,
  },
  exerciseGroups: {
    marginTop: SPACING.sm,
    gap: SPACING.lg,
  },
  blockGroup: {
    gap: SPACING.sm,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.9,
  },
  blockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  blockBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  exerciseList: {
    gap: SPACING.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  exerciseThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  exerciseThumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  exerciseContent: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  exerciseMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  subtitle: {
    marginTop: SPACING.sm,
    opacity: 0.8,
  },
  emptyCard: {
    padding: SPACING.xl,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(128,128,128,0.3)',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
})
