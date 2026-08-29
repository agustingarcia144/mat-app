import { Authenticated, AuthLoading } from "convex/react";
import { useRouter } from "expo-router";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import { WalletPassScreen } from "@/components/features/wallet/wallet-pass-screen";

export default function OnboardingWalletScreen() {
  const router = useRouter();

  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <WalletPassScreen
          onboarding
          onDone={() => router.replace("/(tabs)/home")}
        />
      </Authenticated>
    </>
  );
}
