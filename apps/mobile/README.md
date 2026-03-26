# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Apple Guideline 4.8 checklist

This app now includes `Sign in with Apple` in both auth entry points:

- `app/index.tsx` (sign-in)
- `app/sign-up.tsx` (sign-up)

### Provider setup (Clerk + Apple)

1. In Clerk Dashboard, enable Apple as a social login provider for the environment used by iOS builds.
2. In Apple Developer, enable the `Sign In with Apple` capability for bundle id `com.agusstingarcia144.matapp`.
3. In Clerk provider settings, configure Apple credentials/IDs and callback values exactly as requested by Clerk.
4. Build and run an iOS build after configuration (EAS internal or TestFlight profile).

### iOS QA checklist

- New account creation via Apple from `sign-up`.
- Existing account login via Apple from `sign-in`.
- Cancel Apple flow from native sheet and verify user-facing error behavior.
- App relaunch keeps active session.
- Sign out and sign in again with Apple.
- Regression check for email/password and Google login.

### App Store Connect updates

- Upload at least one screenshot showing `Continuar con Apple` on the auth screen.
- Keep metadata screenshots aligned with current login UI.
- Add this note in App Review:

  "We implemented an equivalent login option using Sign in with Apple on the iOS login and sign-up flows. Users can access it from the initial authentication screens. This option satisfies Guideline 4.8 requirements and is available for App Review testing."
