const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

config.resolver.blockList = [
  /packages[\\/][^\\/]+[\\/]node_modules[/\\]/,
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : []),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@repo/convex") {
    const convexApiPath = path.resolve(
      monorepoRoot,
      "packages/convex/convex/_generated/api.js",
    );
    return {
      type: "sourceFile",
      filePath: convexApiPath,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
