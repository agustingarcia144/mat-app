# Unsaved Changes System (React 19 + Next.js App Router)

## Architecture Summary

The unsaved-changes behavior is centralized around:

1. `UnsavedChangesProvider` (`contexts/unsaved-changes-context.tsx`)
2. `useUnsavedChanges()` hook
3. A single Sonner toast (`id: unsaved-changes-global`)
4. A single shared confirmation modal inside the provider

### Design goals

- One source of truth for unsaved state.
- One toast implementation.
- Global navigation interception (not button-specific).
- Deterministic behavior under concurrent React rendering.
- No deep comparison in render paths.

## Runtime model

Each page/feature registers an entry via `useUnsavedChanges()`.  
An entry can provide:

- `dirty` status
- `isSaving` status
- `onSave` action
- `shouldBlockNavigation(targetPath)` policy

The provider aggregates all dirty entries:

- If **none** are dirty: dismiss toast, no guard prompt.
- If **any** are dirty: show exactly one toast and block navigation attempts according to policy.

## App Router transition handling

The provider intercepts all relevant transition channels:

1. **Internal anchors / `<Link>`** via capture-phase document click listener.
2. **Programmatic routing** via `history.pushState` / `history.replaceState` interception.
3. **Browser back/forward** via `popstate` interception (reverts URL immediately and prompts).
4. **Hard refresh / tab close** via `beforeunload`.

No dependency on legacy `router.events`.

## Concurrency safety choices

- Event handlers read latest state through refs (`entriesRef`, `pendingNavigationRef`).
- Guard decision is centralized (`shouldBlockTransition`) and pure.
- No render-time deep-equality checks.
- No timeout-driven synchronization hacks.
- Side effects are in effects or user events only.

## Current integration

`app/dashboard/planifications/[id]/edit/layout.tsx` registers one unsaved entry:

- `dirty` comes from `react-hook-form` (`useFormState().isDirty`).
- `onSave` triggers `form.handleSubmit(onSubmit)`.
- `isSaving` drives toast button loading state.
- `shouldBlockNavigation` allows route changes inside `/dashboard/planifications/:id/edit` and blocks exits from that flow.

This means:

- Switching between `/edit` and `/edit/day/...` does not prompt.
- Leaving the edit flow prompts once (sidebar/link/programmatic/back-forward/refresh).

---

## Edge-case Test Matrix

### A) State Transitions

| ID    | Scenario                                        | Expected                                                                |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| ST-01 | Page loads with no changes                      | No toast, no modal.                                                     |
| ST-02 | User edits one field                            | One toast appears.                                                      |
| ST-03 | User reverts field to original value            | Toast dismisses.                                                        |
| ST-04 | User saves successfully                         | Toast dismisses; dirty becomes false; redirect proceeds without prompt. |
| ST-05 | Save fails                                      | Toast stays visible; dirty remains true; error toast shown.             |
| ST-06 | Async save pending                              | Save action disabled + spinner text (`Guardando`).                      |
| ST-07 | Rapid successive edits                          | Still one toast id (no duplicates).                                     |
| ST-08 | Multiple independent dirty entries on same page | One global toast; guard active while any entry dirty.                   |
| ST-09 | One of multiple dirty entries becomes clean     | Guard remains if another is still dirty.                                |
| ST-10 | All dirty entries become clean                  | Toast dismissed; guard disabled.                                        |

### B) Navigation

| ID    | Scenario                                                                     | Expected                                              |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| NV-01 | Click internal back button                                                   | Intercepted by global guard if leaving guarded scope. |
| NV-02 | Click sidebar navigation button                                              | Intercepted (history push path).                      |
| NV-03 | Click `<Link>` internal route                                                | Intercepted (capture-phase click).                    |
| NV-04 | `router.push()`                                                              | Intercepted (history push).                           |
| NV-05 | `router.replace()`                                                           | Intercepted (history replace).                        |
| NV-06 | Browser back button                                                          | URL restored and modal shown.                         |
| NV-07 | Browser forward button                                                       | URL restored and modal shown.                         |
| NV-08 | Hard refresh (F5/Cmd+R)                                                      | Native `beforeunload` confirmation.                   |
| NV-09 | Close tab/window                                                             | Native `beforeunload` confirmation.                   |
| NV-10 | Open same route in new tab (ctrl/cmd click)                                  | Not blocked; original tab remains unchanged.          |
| NV-11 | Navigate between two guarded pages inside same scope (`/edit` ↔ `/edit/day`) | Allowed (no modal), dirty state retained.             |
| NV-12 | Navigate from guarded page to outside scope (`/dashboard/planifications`)    | Blocked until confirm.                                |
| NV-13 | Confirm discard                                                              | Transition executes exactly once.                     |
| NV-14 | Cancel discard                                                               | Stay on current route; dirty state unchanged.         |
| NV-15 | Attempt multiple blocked navigations while modal open                        | Latest target kept; no duplicate modals.              |

### C) Lifecycle / App Router Structure

| ID    | Scenario                                             | Expected                                                  |
| ----- | ---------------------------------------------------- | --------------------------------------------------------- |
| LC-01 | Guarded component unmounts                           | Entry unregisters; no stale dirty flags.                  |
| LC-02 | Context/provider re-initialization                   | State starts clean; no stale toasts.                      |
| LC-03 | Nested layouts                                       | Guard remains deterministic within mounted provider.      |
| LC-04 | Parallel routes                                      | Guard decisions based on registered dirty entries only.   |
| LC-05 | Suspense fallback during transition                  | No duplicate toasts/modals; refs keep latest guard state. |
| LC-06 | Rapid mount/unmount cycles (concurrent interruption) | Register/unregister remains idempotent.                   |

### D) UI Consistency

| ID    | Scenario                                       | Expected                                       |
| ----- | ---------------------------------------------- | ---------------------------------------------- |
| UI-01 | Dirty toggles true repeatedly                  | One toast instance (same id).                  |
| UI-02 | Dirty toggles false                            | Toast dismissed immediately.                   |
| UI-03 | Route changes away after confirm               | No stale toast on destination page.            |
| UI-04 | Modal open + user presses escape/outside click | Modal closes and pending navigation clears.    |
| UI-05 | Save button loading state flips                | Toast action updates without duplicate toasts. |
| UI-06 | Long editing session                           | No listener leaks (cleanup on unmount).        |

---

## Future scalability improvements

1. Add analytics hooks for blocked-navigation events (`attempt`, `cancel`, `confirm`).
2. Add policy presets to `useUnsavedChanges` (e.g. `scopePrefix('/dashboard/...')`).
3. Add automated Playwright E2E coverage using this matrix IDs.
4. Add optional custom modal copy per entry (while still rendering one global modal).
5. Provide route-aware ignore attributes for known safe links (e.g. hash-only docs anchors).
