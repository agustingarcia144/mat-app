import { Authenticated, AuthLoading } from "convex/react";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import { WalletPassScreen } from "@/components/features/wallet/wallet-pass-screen";

export default function ProfileWalletPassScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <WalletPassScreen />
      </Authenticated>
    </>
  );
}
