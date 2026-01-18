# Convex Setup Guide

This project uses [Convex](https://www.convex.dev/) as the backend API for both the web and mobile applications.

## Initial Setup

1. **Install Convex CLI** (if not already installed):
   ```bash
   npm install -g convex
   ```

2. **Login to Convex**:
   ```bash
   npx convex login
   ```

3. **Initialize and start Convex development server**:
   ```bash
   pnpm convex:dev
   ```
   
   This will:
   - Create a new Convex project (if you don't have one)
   - Start the development server
   - Generate TypeScript types in `convex/_generated/`
   - Provide you with a deployment URL

4. **Set environment variables**:
   
   After running `convex dev`, you'll get a deployment URL. Add it to:
   
   - **Web app**: Create `apps/web/.env.local` with:
     ```
     NEXT_PUBLIC_CONVEX_URL=https://your-deployment-url.convex.cloud
     ```
   
   - **Mobile app**: Create `apps/mobile/.env.local` with:
     ```
     EXPO_PUBLIC_CONVEX_URL=https://your-deployment-url.convex.cloud
     ```

## Project Structure

- `packages/convex/` - Backend functions (queries, mutations, actions)
  - `schema.ts` - Database schema definitions
  - `example.ts` - Example query and mutation functions
  - `_generated/` - Auto-generated TypeScript types (gitignored)
  - `package.json` - Convex package configuration

## Usage

### In Web App (Next.js)

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.getExample);
  const createExample = useMutation(api.example.createExample);
  
  // Use data and mutations...
}
```

### In Mobile App (React Native/Expo)

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.getExample);
  const createExample = useMutation(api.example.createExample);
  
  // Use data and mutations...
}
```

## Available Scripts

- `pnpm convex:dev` - Start Convex development server
- `pnpm convex:deploy` - Deploy to production
- `pnpm convex:codegen` - Generate TypeScript types

## Documentation

- [Convex Documentation](https://docs.convex.dev/)
- [Convex React Client](https://docs.convex.dev/client/react)
- [Convex React Native Guide](https://docs.convex.dev/quickstart/react-native)

