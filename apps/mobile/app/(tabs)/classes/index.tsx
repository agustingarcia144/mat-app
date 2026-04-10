import React from "react";
import { Authenticated, AuthLoading } from "convex/react";

import LoadingScreen from "@/components/shared/screens/loading-screen";
import ClassesContent from "@/components/features/classes/classes-content";

export default function ClassesScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <ClassesContent />
      </Authenticated>
    </>
  );
}
