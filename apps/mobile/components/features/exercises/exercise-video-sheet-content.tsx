import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import YoutubePlayer from "react-native-youtube-iframe";
import { api } from "@repo/convex";
import { getYoutubeVideoId } from "@repo/core/utils";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/components/ui/empty-state";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";

export default function ExerciseVideoSheetContent() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [isPlaying, setIsPlaying] = useState(true);

  const exercise = useQuery(
    api.exercises.getById,
    exerciseId ? { id: exerciseId as any } : "skip",
  );

  const youtubeVideoId = useMemo(() => {
    if (!exercise?.videoUrl) return null;
    return getYoutubeVideoId(exercise.videoUrl);
  }, [exercise?.videoUrl]);

  const openVideo = useCallback(() => {
    if (exercise?.videoUrl) Linking.openURL(exercise.videoUrl);
  }, [exercise?.videoUrl]);

  const onPlayerStateChange = useCallback(
    (state: string) => {
      if (state === "playing") {
        setIsPlaying(true);
        return;
      }
      if (state === "paused" || state === "ended") {
        setIsPlaying(false);
      }
      if (state === "ended") {
        router.back();
      }
    },
    [router],
  );

  const onPlayerError = useCallback(() => {
    router.back();
    openVideo();
  }, [openVideo, router]);

  if (exercise === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  if (!exercise || !youtubeVideoId) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <EmptyState
          title="Video no disponible"
          description="Podés abrirlo en YouTube"
          imageSize={100}
        >
          <ThemedText style={styles.emptyAction} onPress={openVideo}>
            Abrir en YouTube
          </ThemedText>
        </EmptyState>
      </ThemedView>
    );
  }

  // Keep a bounded player size so it renders correctly on small sheet detents.
  const maxPlayerWidth = Math.max(windowWidth - 32, 240);
  const preferredHeight = (maxPlayerWidth * 9) / 16;
  const playerHeight = Math.max(150, Math.min(preferredHeight, 260));
  const playerWidth = (playerHeight * 16) / 9;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.playerWrap}>
        <YoutubePlayer
          height={playerHeight}
          width={playerWidth}
          videoId={youtubeVideoId}
          play={isPlaying}
          initialPlayerParams={{
            controls: true,
            modestbranding: true,
            rel: false,
            iv_load_policy: 3,
            playsinline: true,
          }}
          style={styles.player}
          webViewStyle={styles.player}
          forceAndroidAutoplay
          webViewProps={{
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            scrollEnabled: false,
            bounces: false,
          }}
          onChangeState={onPlayerStateChange}
          onError={onPlayerError}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  centered: {
    alignItems: "center",
  },
  playerWrap: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "center",
    width: "100%",
    maxWidth: 462,
  },
  player: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  emptyTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  emptyAction: {
    fontSize: 16,
    textDecorationLine: "underline",
    opacity: 0.85,
  },
});
