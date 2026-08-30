"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type MatiAnimation = "idle" | "wave" | "running" | "failed" | "review";

const ROWS: Record<MatiAnimation, { row: number; durations: number[] }> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  wave: { row: 3, durations: [140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
};

export function MatiSprite({
  animation = "idle",
  className,
}: {
  animation?: MatiAnimation;
  className?: string;
}) {
  const [frame, setFrame] = useState(0);
  const [lookFrame, setLookFrame] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const config = ROWS[animation];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let current = 0;
    let timer: number;
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        current = (current + 1) % config.durations.length;
        setFrame(current);
        scheduleNext();
      }, config.durations[current]);
    };
    scheduleNext();
    return () => window.clearTimeout(timer);
  }, [animation, config.durations, reducedMotion]);

  useEffect(() => {
    if (animation !== "idle" || reducedMotion) return;
    const onPointerMove = (event: PointerEvent) => {
      const dx = event.clientX - (window.innerWidth - 54);
      const dy = event.clientY - (window.innerHeight - 54);
      if (Math.hypot(dx, dy) < 90) {
        setLookFrame(null);
        return;
      }
      const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
      setLookFrame(Math.round(((degrees + 360) % 360) / 22.5) % 16);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [animation, reducedMotion]);

  const cell = useMemo(() => {
    if (lookFrame !== null && animation === "idle" && !reducedMotion) {
      return { column: lookFrame % 8, row: lookFrame < 8 ? 9 : 10 };
    }
    return {
      column: reducedMotion ? 0 : frame % config.durations.length,
      row: config.row,
    };
  }, [animation, config.durations.length, config.row, frame, lookFrame, reducedMotion]);

  return (
    <span
      aria-hidden="true"
      className={cn("block bg-no-repeat [image-rendering:auto]", className)}
      style={{
        backgroundImage: "url('/pets/mati/spritesheet.webp')",
        backgroundSize: "800% 1100%",
        backgroundPosition: `${(cell.column / 7) * 100}% ${(cell.row / 10) * 100}%`,
      }}
    />
  );
}
