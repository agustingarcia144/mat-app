import React from "react";
import { Authenticated, AuthLoading } from "convex/react";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import ProofUploadForm from "@/components/features/plan/proof-upload-form";

export default function UploadProofScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <ProofUploadForm />
      </Authenticated>
    </>
  );
}
