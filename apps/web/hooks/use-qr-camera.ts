"use client";

import * as React from "react";

export type QrCameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "denied"
  | "unsupported"
  | "error";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

/**
 * The same payload stays in front of the camera for many frames, and dynamic
 * codes burn on first use (QR_REPLAYED). Ignore repeats inside this window.
 */
const DUPLICATE_WINDOW_MS = 3_000;
const FRAME_INTERVAL_MS = 100;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const detector = (
    window as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;
  return detector ?? null;
}

/**
 * Decodes QR codes from a webcam so a gym without a USB reader can still run
 * the check-in desk. Prefers the native BarcodeDetector (Chrome/Edge) and lazy
 * loads ZXing only when it is missing, so most kiosks never download it.
 */
export function useQrCamera({
  active,
  onDecode,
}: {
  active: boolean;
  onDecode: (payload: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const lastDecodeRef = React.useRef<{ payload: string; at: number } | null>(
    null,
  );
  const onDecodeRef = React.useRef(onDecode);
  const [status, setStatus] = React.useState<QrCameraStatus>("idle");

  React.useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const emit = React.useCallback((payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) return;

    const previous = lastDecodeRef.current;
    const now = Date.now();
    if (
      previous &&
      previous.payload === trimmed &&
      now - previous.at < DUPLICATE_WINDOW_MS
    ) {
      return;
    }

    lastDecodeRef.current = { payload: trimmed, at: now };
    onDecodeRef.current(trimmed);
  }, []);

  React.useEffect(() => {
    if (!active) {
      setStatus("idle");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("unsupported");
      return;
    }

    const videoElement = videoRef.current;
    let cancelled = false;
    let frameTimer: ReturnType<typeof setTimeout> | null = null;
    let zxingControls: { stop: () => void } | null = null;

    async function scanWithDetector(detector: BarcodeDetectorLike) {
      const video = videoRef.current;
      if (cancelled || !video) return;

      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        try {
          const codes = await detector.detect(video);
          if (cancelled) return;
          const hit = codes.find((code) => code.rawValue);
          if (hit) emit(hit.rawValue);
        } catch {
          // A single dropped frame is not fatal; keep polling.
        }
      }

      if (!cancelled) {
        frameTimer = setTimeout(
          () => void scanWithDetector(detector),
          FRAME_INTERVAL_MS,
        );
      }
    }

    async function scanWithZxing() {
      const video = videoRef.current;
      if (cancelled || !video) return;

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (cancelled) return;

      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: FRAME_INTERVAL_MS,
      });
      zxingControls = await reader.decodeFromVideoElement(video, (result) => {
        if (!cancelled && result) emit(result.getText());
      });
      if (cancelled) zxingControls.stop();
    }

    async function start() {
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            // Autoplay can be refused; the visible controls let the user retry.
          });
        }
        if (cancelled) return;
        setStatus("scanning");

        const Detector = getBarcodeDetector();
        if (Detector) {
          void scanWithDetector(new Detector({ formats: ["qr_code"] }));
        } else {
          await scanWithZxing();
        }
      } catch (error) {
        if (cancelled) return;
        const name = (error as { name?: string })?.name;
        setStatus(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "error",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (frameTimer) clearTimeout(frameTimer);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      lastDecodeRef.current = null;
      if (videoElement) videoElement.srcObject = null;
    };
  }, [active, emit]);

  return { videoRef, status };
}
