import { defineConfig } from 'eslint/config'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig([
  {
    extends: [...nextCoreWebVitals],
    rules: {
      // Enforce single quotes (template strings/backticks are always allowed)
      quotes: ['error', 'single', { avoidEscape: true }],
      // Enforce no semicolons
      semi: ['error', 'never'],
      // Enforce trailing commas (ES5 style - objects and arrays)
      'comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'never',
        },
      ],
    },
  },
])