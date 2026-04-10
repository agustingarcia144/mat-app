import React from "react";
import { Authenticated, AuthLoading } from "convex/react";
import { AssignmentDetailContent } from "@/components/features/planifications";
import LoadingScreen from "@/components/shared/screens/loading-screen";

export default function AssignmentDetailScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <AssignmentDetailContent />
      </Authenticated>
    </>
  );
}
