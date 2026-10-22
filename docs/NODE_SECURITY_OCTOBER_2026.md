# Node.js security update — October 22, 2026

Advisory: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases

## Verified status

| Environment | Observed version | Status |
| --- | --- | --- |
| Local development | 24.22.1 | Official binary installed and SHA-256 verified; shell resolves to it |
| EAS builds, both mobile apps | 24.22.1 configured | All five profiles per app updated; no mobile builds submitted |
| Vercel production, matgestion.app | 24.x | Existing deployment uses the supported major; exact runtime patch not verified |
| Convex development, Node 24 | 24.21.0 | Below the advisory's fixed 24.22.1 version |
| Convex development, Node 22 | 22.23.2 | Below the advisory's fixed 22.23.4 version |
| Convex production | Exact version not verified | No production deployment performed; local configuration selects 24 for the next deployment |

Convex patch observations came from the internal-only
`runtimeDiagnosticsNode:versions` action after selecting each major in development.
Node 24 was restored as the selected development runtime after the comparison.
Convex controls patch versions; selecting a major does not prove patch coverage.
Ask Convex whether these runtimes include a backport or when patched versions
will be available.

Vercel's advisory says patch versions are managed for projects on Node 22/24,
and describes its patch rollout as in progress. Its WAF does not protect against
malicious responses fetched by server code:
https://vercel.com/ja/kb/bulletin/node-js-security-advisory

## Local installation

Homebrew installation failed twice with an OpenSSL dependency lock error.
The official macOS arm64 distribution was installed instead at
`~/.local/share/node/node-v24.22.1-darwin-arm64`, with `node`, `npm`, and `npx`
symlinks in `~/.local/bin`. Both login and interactive shell checks resolved
Node 24.22.1. The older Homebrew Node installation still exists.
Restart existing development servers to use the new runtime.

## Validation

- Shared package tests: 34 passed across three files.
- Shared package build and Next.js production build: passed on Node 24.22.1.
- Convex production dry run, including TypeScript/schema checks: passed.
- Convex development deployment and runtime diagnostic: passed.
- EAS profile version consistency and `git diff --check`: passed.
- No production deployment, Git push, or mobile submission was performed.

## Remaining steps

1. Obtain Convex confirmation of security patch coverage. Suggested message:

   > We are checking the October 21 Node.js security release, including
   > CVE-2026-111497. Our development Node actions report Node 24.21.0 when
   > selecting major 24 and 22.23.2 when selecting major 22. Have the fixes been
   > backported to these runtimes, or when will 24.22.1 / 22.23.4 or newer be
   > available? Is a redeployment required for existing production actions?

2. Recheck development with
   `pnpm --filter @repo/convex exec convex run runtimeDiagnosticsNode:versions`.
3. Once coverage is confirmed, review and deploy the intended backend revision
   with the Node 24 configuration, then run the same diagnostic with `--prod`.
4. Confirm Vercel's managed runtime rollout is complete for the live deployment.
5. Smoke-test sign-in, gym join links, invitations, push notifications, and
   billing after production runtime changes.
