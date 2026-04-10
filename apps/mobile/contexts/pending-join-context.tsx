import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Linking } from "react-native";
import {
  clearPendingJoinToken,
  getPendingJoinToken,
  parseJoinTokenFromUrl,
  setPendingJoinToken as persistPendingJoinToken,
} from "@/lib/pending-join";

type PendingJoinContextValue = {
  pendingToken: string | null;
  setPendingToken: (token: string | null) => void;
  clearPending: () => Promise<void>;
  isLoading: boolean;
};

const PendingJoinContext = createContext<PendingJoinContextValue | null>(null);

export function usePendingJoin() {
  const ctx = useContext(PendingJoinContext);
  if (!ctx) {
    throw new Error("usePendingJoin must be used within PendingJoinProvider");
  }
  return ctx;
}

export function PendingJoinProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendingToken, setPendingTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getPendingJoinToken()
      .then((t) => setPendingTokenState(t))
      .finally(() => setIsLoading(false));
  }, []);

  const setPendingToken = useCallback(async (token: string | null) => {
    if (token) {
      await persistPendingJoinToken(token);
      setPendingTokenState(token);
    } else {
      await clearPendingJoinToken();
      setPendingTokenState(null);
    }
  }, []);

  const clearPending = useCallback(async () => {
    await clearPendingJoinToken();
    setPendingTokenState(null);
  }, []);

  useEffect(() => {
    const handleUrl = (url: string) => {
      const token = parseJoinTokenFromUrl(url);
      if (token) {
        setPendingToken(token);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [setPendingToken]);

  const value: PendingJoinContextValue = {
    pendingToken,
    setPendingToken,
    clearPending,
    isLoading,
  };

  return (
    <PendingJoinContext.Provider value={value}>
      {children}
    </PendingJoinContext.Provider>
  );
}
