const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => ({
  ...config,
  name: isDevelopment ? "Mat Gestion Dev" : config.name,
  scheme: isDevelopment ? "mat-app-dev" : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: isDevelopment
      ? "com.agusstingarcia144.matapp.dev"
      : config.ios.bundleIdentifier,
  },
  plugins: [
    ...config.plugins,
    [
      "expo-dev-client",
      {
        addGeneratedScheme: isDevelopment,
      },
    ],
  ],
});
