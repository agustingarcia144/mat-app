# mat-app

A gym workout tracking application built with React Native and Next.js.

## Node.js

Use Node.js 24.22.1 or a newer patched 24.x release for development and builds.
With nvm, run `nvm install` and `nvm use` from the repository root.
The package manager version is specified in `package.json`.

Both mobile apps pin Node.js in their EAS build profiles. When updating Node,
keep those profiles and `.nvmrc` aligned with the minimum in `package.json`.
Convex Node actions select major version 24 in `packages/convex/convex.json`;
Convex manages the patch version. Apply that setting with a Convex deployment
and verify the provider has rolled out the required security patches.
Check the deployed Node patch with
`pnpm --filter @repo/convex exec convex run --prod runtimeDiagnosticsNode:versions`.

For the web host, select Node.js 24 and verify its runtime includes the latest
security patches. Rebuild/redeploy as required by the host, then smoke-test
sign-in, gym join links, invitations, notifications, and billing.

See [the October 2026 security check](docs/NODE_SECURITY_OCTOBER_2026.md) for
verified runtime versions and the remaining provider checks.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `mobile`: a [react-native](https://reactnative.dev/) app built with [expo](https://docs.expo.dev/) for iOS and Android
- `web`: a [Next.js](https://nextjs.org/) app built with [react-native-web](https://necolas.github.io/react-native-web/)
- `@repo/core`: a shared library for business logic and data models
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [Expo](https://docs.expo.dev/) for native development
- [Convex](https://www.convex.dev/) for backend and real-time data
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [Prettier](https://prettier.io) for code formatting
