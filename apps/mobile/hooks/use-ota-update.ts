import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

async function checkAndApplyUpdate() {
  if (!Updates.isEnabled) return;

  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Not worth crashing over a failed update check
  }
}

export function useOTAUpdate() {
  useEffect(() => {
    void checkAndApplyUpdate();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkAndApplyUpdate();
      }
    });

    return () => subscription.remove();
  }, []);
}
