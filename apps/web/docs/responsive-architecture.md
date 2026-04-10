# Responsive Architecture Strategy (Desktop Preserved)

## 1) Responsive architecture plan

This refactor follows a **presentation-layer split** with a strict rule:

- **Desktop remains source of truth** and is preserved.
- Mobile changes are **additive** (`sm:`, `md:`) or alternate render trees selected by breakpoint.
- Business logic, data fetching, and mutations stay shared.

Implementation layers:

1. **Responsive primitives**
   - `hooks/use-media-query.ts`
   - `hooks/use-mobile.tsx`
   - `components/ui/responsive-action-button.tsx`
   - `components/shared/responsive/dashboard-page-container.tsx`
2. **Simple component adaptation**
   - Tailwind breakpoint tuning for spacing, typography, and overflow.
3. **Heavy component visual adapters**
   - Separate mobile visual trees for data-dense/complex UIs.

## 2) Breakpoint strategy

Current strategy:

- **Mobile:** `< 768px` (target phones: 390–430)
- **Tablet:** `768px – 1023px`
- **Desktop:** `>= 1024px` (legacy desktop layout behavior preserved)

Rules:

- Keep existing desktop classes as-is.
- Apply mobile-safe changes via additive classes (`px-3 md:px-0`, `text-2xl md:text-3xl`, etc.).
- Use `useIsMobile()` for heavy alternate views where CSS-only adaptation is insufficient.

## 3) Button abstraction (icon-only on mobile)

Use `ResponsiveActionButton` for action buttons with icon + text:

- On mobile: icon-only visual, text hidden with `sr-only`.
- On desktop: icon + text unchanged visually.
- `aria-label` is always set (inferred from `label` if not provided).
- Optional tooltip support built in.

Pattern:

```tsx
<ResponsiveActionButton
  icon={<Plus className='h-4 w-4' aria-hidden />}
  label='Nueva planificación'
  tooltip='Nueva planificación'
  onClick={...}
/>
```

## 4) Heavy component mobile redesign strategy

### A) Calendar: desktop grid -> mobile agenda list

- File: `components/features/classes/calendar/weekly-timeline.tsx`
- Desktop: existing weekly time grid retained.
- Mobile: day-grouped agenda cards with same click behavior/state transitions.
- Shared logic: same `schedules`, same callbacks, same date navigation.

### B) Kanban-like week planner: desktop 7-column board -> mobile collapsible weekday stacks

- File: `components/features/planifications/form/week-calendar-row.tsx`
- Desktop: existing 7-column board retained.
- Mobile: vertical sections by weekday using collapsible groups.
- Same state/mutations (`react-hook-form`, add/copy/remove, drag drop target updates).

### C) Data-dense member table -> mobile card list

- File: `app/dashboard/members/page.tsx`
- Desktop: `DataTable` retained.
- Mobile: compact cards with avatar/status + same detail dialog state.

### D) Planifications workspace: desktop split resizable panels -> mobile sheet + stacked feed

- File: `app/dashboard/planifications/page.tsx`
- Desktop: existing resizable folder/list layout retained.
- Mobile: folder selection via sheet + stacked planification cards.
- Shared folder/filter/query logic.

## 5) Layout adaptation strategy

Use `DashboardPageContainer` for mobile-safe horizontal gutters while preserving desktop:

- `container mx-auto px-3 sm:px-4 md:px-0`
- Page headers convert to stacked mobile layout (`flex-col ... md:flex-row`)
- Typography scales additively (`text-2xl md:text-3xl`)
- Borders/padding tuned for touch density (`p-3 md:p-4`, `p-3 md:p-6`)
- Overflow handled intentionally (`overflow-x-auto` where tabular views remain)

## 6) Accessibility considerations

- Icon-only mobile actions keep semantic labels via `aria-label`.
- Hidden text uses `sr-only md:not-sr-only`.
- Interactive cards/buttons remain keyboard focusable.
- Existing tooltip support is preserved for discoverability.
- No hidden duplicate interactive controls rendered simultaneously.

## 7) Performance considerations (React 19 + concurrent-safe)

- `useMediaQuery` uses `useSyncExternalStore` for stable concurrent subscriptions.
- Heavy mobile/desktop variants are conditionally rendered (not both in parallel).
- Visual adapters share state/controllers; no duplicated mutation pipelines.
- Avoids layout thrash by reducing deep nested horizontal grids on narrow screens.
- Keeps hydration safe with deterministic server fallback in media query hook.

## 8) Example implementation patterns

### Visual adapter with shared logic

```tsx
const isMobile = useIsMobile();
const data = useMemo(() => deriveData(raw), [raw]);

return isMobile ? (
  <MobilePresentation data={data} onSelect={onSelect} />
) : (
  <DesktopPresentation data={data} onSelect={onSelect} />
);
```

### Shared state, separate presentation

- Keep form/query/mutation in parent container.
- Pass derived props into `MobileView` / `DesktopView`.
- Keep event handlers memoized and shared.

## 9) Incremental migration rollout plan

### Phase 0 - Baseline

- Capture desktop screenshots for key routes.
- Define no-regression acceptance criteria for desktop.

### Phase 1 - Primitives

- Land `useMediaQuery`, `useIsMobile`, `ResponsiveActionButton`, page container.

### Phase 2 - High-impact heavy views

- Calendar mobile agenda.
- Planification board mobile weekday stacks.
- Planification workspace mobile sheet + stacked feed.
- Members mobile card list.

### Phase 3 - Simple components sweep

- Replace icon+text action buttons with `ResponsiveActionButton`.
- Normalize spacing and typography utilities on remaining pages.

### Phase 4 - QA matrix

- Phone widths: `390`, `412`, `430`.
- Tablets: `768`, `834`, `1024`.
- Interaction checks: keyboard, touch hit area, dialogs/sheets, overflow containers.

### Phase 5 - Hardening

- Add visual regression checks for desktop routes.
- Add mobile interaction smoke tests (Playwright/Cypress) for heavy screens.
