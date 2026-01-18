# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is mat-app, a gym workout tracking application built as a Turborepo monorepo with React Native + Next.js. The codebase uses pnpm workspaces and includes:

- **mobile**: Expo-based React Native app with expo-router for navigation
- **web**: Next.js app using react-native-web for cross-platform UI
- **@repo/lib**: Shared library for business logic and data models
- **@repo/typescript-config**: Shared TypeScript configurations
- **convex**: Backend API powered by Convex (located in packages/convex)

## Architecture

### Cross-Platform Strategy

The monorepo uses react-native-web to share UI components between native and web platforms:

- Shared components can be written in React Native (using `react-native` primitives like `View`, `Text`, `Pressable`)
- The web app (Next.js) transpiles these components to web equivalents via react-native-web
- The mobile app (Expo) uses them directly
- Business logic and data models are shared via `@repo/lib`

### Routing

- **Mobile app**: Uses expo-router (file-based routing in `apps/mobile/app/`)
- **Web app**: Uses Next.js App Router (file-based routing in `apps/web/app/`)

### Build System

Turborepo orchestrates builds with dependency graph awareness:
- Shared library package builds first (`tsup` bundles TypeScript to `dist/`)
- Apps depend on `@repo/lib` via workspace protocol (`workspace:*`)
- Turbo caches build outputs for incremental builds
- Convex backend runs as a package via `pnpm dev` and syncs via WebSocket

## Common Commands

### Development

```bash
# Start all apps in dev mode
pnpm dev

# Start specific app
pnpm --filter mobile dev
pnpm --filter web dev

# Start Convex backend (runs automatically with pnpm dev)
pnpm convex:dev  # Or run directly

# Start mobile app on specific platform
cd apps/mobile
pnpm ios      # Run on iOS simulator
pnpm android  # Run on Android emulator
pnpm web      # Run Expo web version
```

### Building

```bash
# Build all apps and packages
pnpm build

# Build specific package/app
pnpm --filter @repo/lib build
pnpm --filter web build
```

### Linting and Formatting

```bash
# Format all files
pnpm format

# Lint web app (only web has ESLint configured)
pnpm --filter web lint
```

### Cleaning

```bash
# Clean all build outputs and node_modules
pnpm clean

# Clean specific package
pnpm --filter @repo/lib clean
```

## Development Workflow

### Adding Shared Library Code

1. Create module in `packages/lib/src/`
2. Export from `packages/lib/src/index.ts`
3. Run `pnpm --filter @repo/lib build` (or use `pnpm --filter @repo/lib dev` for watch mode)
4. Import in apps: `import { Module } from '@repo/lib'`

Use TypeScript and platform-agnostic code for shared business logic and data models.

### Making Changes

When editing shared packages (`@repo/lib`), run the package in dev/watch mode while developing:

```bash
pnpm --filter @repo/lib dev
```

This watches for changes and rebuilds automatically, allowing apps to see updates without manual rebuilds.

## Technical Details

- **Package Manager**: pnpm 10.23.0
- **Node Version**: >=18
- **TypeScript**: Used throughout (strict mode)
- **Expo**: New Architecture enabled (`newArchEnabled: true`)
- **Next.js**: React Strict Mode enabled

## File Structure Patterns

- `apps/mobile/app/`: Expo Router screens (use `_layout.tsx` for layouts)
- `apps/web/app/`: Next.js App Router pages (use `layout.tsx` for layouts)
- `packages/lib/src/`: Shared business logic and data models
- `packages/convex/`: Backend API functions (queries, mutations, actions)
- Component files should export both component and props interface
