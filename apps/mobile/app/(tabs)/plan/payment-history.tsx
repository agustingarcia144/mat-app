import React from "react";
import { Authenticated, AuthLoading } from "convex/react";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import PaymentHistoryContent from "@/components/features/plan/payment-history-content";

export default function PaymentHistoryScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <PaymentHistoryContent />
      </Authenticated>
    </>
  );
}
