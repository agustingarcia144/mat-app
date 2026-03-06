const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Monorepo setup
const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

// Enable package exports resolution (required for @repo/core/utils subpath imports)
config.resolver.unstable_enablePackageExports = true

// Exclude packages/*/node_modules to fix TreeFS "already exists in file map" conflict
config.resolver.blockList = [
  /packages[\\/][^\\/]+[\\/]node_modules[/\\]/,
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : []),
]

// Configure module resolution
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Resolve @repo/convex to the generated API
  if (moduleName === '@repo/convex') {
    const convexApiPath = path.resolve(
      monorepoRoot,
      'packages/convex/convex/_generated/api.js'
    )
    return {
      type: 'sourceFile',
      filePath: convexApiPath,
    }
  }

  // Use default resolution for everything else
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
