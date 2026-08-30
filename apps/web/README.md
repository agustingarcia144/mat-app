## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

To create [API routes](https://nextjs.org/docs/app/building-your-application/routing/router-handlers) add an `api/` directory to the `app/` directory with a `route.ts` file. For individual endpoints, create a subfolder in the `api` directory, like `api/hello/route.ts` would map to [http://localhost:3000/api/hello](http://localhost:3000/api/hello).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn/foundations/about-nextjs) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_source=github.com&utm_medium=referral&utm_campaign=turborepo-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Sentry

The app is configured with `@sentry/nextjs` for server, edge, and browser error reporting. The local test route is available at `/sentry-example-page`.

For production, configure these environment variables in the hosting provider:

```bash
NEXT_PUBLIC_SENTRY_DSN=<public project DSN>
SENTRY_DSN=<server project DSN, optional if it matches NEXT_PUBLIC_SENTRY_DSN>
SENTRY_ORG=mat-app
SENTRY_PROJECT=javascript-nextjs
SENTRY_AUTH_TOKEN=<Sentry auth token for source map uploads>
```

`SENTRY_AUTH_TOKEN` is secret and should only be available at build time. Do not commit it; the wizard-created `.env.sentry-build-plugin` file is ignored for local source map upload testing.

On Vercel, add `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to the runtime environments you deploy. Add `SENTRY_AUTH_TOKEN` as a protected build environment variable so production and preview builds can upload source maps.

The Sentry DSN is not a secret, but the auth token is. If the auth token is exposed in logs, chat transcripts, or a shared terminal recording, revoke it in Sentry and generate a new token with project-scoped source map upload permissions.

## Mati AI

The staff AI assistant requires an OpenAI API key in the web server environment:

```bash
OPENAI_API_KEY=<server-only OpenAI API key>
OPENAI_CHAT_MODEL=gpt-5.6-luna
```

`OPENAI_CHAT_MODEL` is optional and defaults to `gpt-5.6-luna`. Keep both values server-only; neither should use the `NEXT_PUBLIC_` prefix.
