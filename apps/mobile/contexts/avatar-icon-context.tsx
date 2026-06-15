import React, { createContext, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useUser } from "@clerk/expo";
import {
  AVATAR_PX,
  CircularAvatarRasterizer,
} from "@/components/features/profile/circular-avatar-rasterizer";

type AvatarIconValue = {
  /** Square (sized) crop of the avatar, used as a fallback while the circle renders. */
  squareUri: string | null;
  /** Circular PNG data URI, ready to use as the profile tab icon. */
  circularDataUri: string | null;
};

const AvatarIconContext = createContext<AvatarIconValue>({
  squareUri: null,
  circularDataUri: null,
});

/**
 * Produces a circular version of the user's avatar for use as the native
 * profile tab icon. The rasterizer is rendered here (inside the on-screen root
 * view tree) so `toDataURL` can capture it; the result is exposed via context
 * to the tab layout.
 */
export function AvatarIconProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [circular, setCircular] = useState<{
    sourceUrl: string;
    dataUri: string;
  } | null>(null);

  // The native Android tab bar tints every icon, so a photo can't be shown
  // there (it becomes a solid silhouette). We only build/rasterize the avatar
  // on iOS; Android falls back to a vector person icon in the tab layout.
  const squareUri = useMemo(() => {
    if (Platform.OS !== "ios" || !user?.imageUrl) return null;
    const separator = user.imageUrl.includes("?") ? "&" : "?";
    return `${user.imageUrl}${separator}width=${AVATAR_PX}&height=${AVATAR_PX}&fit=crop`;
  }, [user?.imageUrl]);

  const ready = !!squareUri && circular?.sourceUrl === squareUri;

  const value = useMemo<AvatarIconValue>(
    () => ({
      squareUri,
      circularDataUri: ready ? circular!.dataUri : null,
    }),
    [squareUri, ready, circular],
  );

  return (
    <AvatarIconContext.Provider value={value}>
      {children}
      {squareUri && !ready && (
        <CircularAvatarRasterizer
          key={squareUri}
          uri={squareUri}
          onReady={(dataUri) => setCircular({ sourceUrl: squareUri, dataUri })}
        />
      )}
    </AvatarIconContext.Provider>
  );
}

export function useAvatarIcon() {
  return useContext(AvatarIconContext);
}
