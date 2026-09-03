import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RewardsData } from "./model";

type Marker = { id: string | null; createdAt: number };
export type MilestoneCelebration = {
  title: string;
  message: string;
  detail: string;
};

function safeKey(organizationId: string, userId: string) {
  return `rewards_milestone_${organizationId}_${userId}`.replace(
    /[^A-Za-z0-9._-]/g,
    "_",
  );
}

export function useMilestoneCelebration(
  data: RewardsData | null | undefined,
  userId: string | undefined,
) {
  const [celebration, setCelebration] = useState<MilestoneCelebration | null>(
    null,
  );
  const [pendingMarker, setPendingMarker] = useState<Marker | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const evaluatingRef = useRef(false);

  const bonusEntries = useMemo(
    () =>
      (data?.ledger ?? []).filter(
        (entry) =>
          entry.type === "earn" &&
          (entry.sourceType === "weekly_bonus" ||
            entry.sourceType === "streak_bonus"),
      ),
    [data?.ledger],
  );

  useEffect(() => {
    const organizationId = data?.organization?._id;
    if (!organizationId || !userId || evaluatingRef.current || celebration)
      return;
    const key = safeKey(String(organizationId), userId);
    const evaluationStartedAt = Date.now();

    evaluatingRef.current = true;
    void (async () => {
      try {
        let marker = markerRef.current;
        if (loadedKeyRef.current !== key) {
          const raw = await SecureStore.getItemAsync(key);
          const newest = bonusEntries[0];
          if (!raw) {
            const baseline: Marker = newest
              ? { id: String(newest._id), createdAt: newest.createdAt }
              : { id: null, createdAt: evaluationStartedAt };
            await SecureStore.setItemAsync(key, JSON.stringify(baseline));
            markerRef.current = baseline;
            loadedKeyRef.current = key;
            return;
          }
          marker = JSON.parse(raw) as Marker;
          markerRef.current = marker;
          loadedKeyRef.current = key;
        }
        if (!marker) return;
        const markerIndex = marker.id
          ? bonusEntries.findIndex((entry) => String(entry._id) === marker.id)
          : -1;
        const unseen =
          markerIndex >= 0
            ? bonusEntries.slice(0, markerIndex)
            : bonusEntries.filter(
                (entry) => entry.createdAt > marker.createdAt,
              );

        if (unseen.length === 0) return;

        const hasWeekly = unseen.some(
          (entry) => entry.sourceType === "weekly_bonus",
        );
        const hasStreak = unseen.some(
          (entry) => entry.sourceType === "streak_bonus",
        );
        const total = unseen.reduce((sum, entry) => sum + entry.points, 0);
        const latest = unseen[0];
        setPendingMarker({
          id: String(latest._id),
          createdAt: latest.createdAt,
        });
        setCelebration({
          title:
            hasWeekly && hasStreak
              ? "¡Doble objetivo cumplido!"
              : hasWeekly
                ? "¡Semana completada!"
                : "¡Racha conseguida!",
          message:
            hasWeekly && hasStreak
              ? "Completaste tu meta semanal y alcanzaste un nuevo hito de racha."
              : hasWeekly
                ? "Tu constancia de esta semana tuvo premio."
                : "Tu constancia sigue creciendo. ¡No aflojes!",
          detail: `Sumaste +${total} ${data.settings.pointsName}`,
        });
      } catch {
        loadedKeyRef.current = key;
      } finally {
        evaluatingRef.current = false;
      }
    })();
  }, [
    bonusEntries,
    celebration,
    data?.organization?._id,
    data?.settings.pointsName,
    userId,
  ]);

  const acknowledge = useCallback(async () => {
    const organizationId = data?.organization?._id;
    if (organizationId && userId && pendingMarker) {
      try {
        await SecureStore.setItemAsync(
          safeKey(String(organizationId), userId),
          JSON.stringify(pendingMarker),
        );
      } catch {
        // The reward experience should remain usable if local persistence fails.
      }
      markerRef.current = pendingMarker;
    }
    setCelebration(null);
    setPendingMarker(null);
  }, [data?.organization?._id, pendingMarker, userId]);

  return { celebration, acknowledge };
}
