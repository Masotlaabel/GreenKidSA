"use client";
import { useEffect, useRef, useCallback } from "react";

interface UseLocationBroadcastOptions {
  /** Only broadcast while this is true (e.g. driver has an active job) */
  enabled: boolean;
  /** How often to POST location, in milliseconds. Default: 30 000 (30s) */
  intervalMs?: number;
}

/**
 * useLocationBroadcast
 *
 * When `enabled` is true, this hook:
 *  1. Requests the browser's Geolocation permission once.
 *  2. Immediately sends the current position to POST /api/driver/location.
 *  3. Re-sends every `intervalMs` milliseconds.
 *  4. Stops automatically when `enabled` flips back to false or the
 *     component unmounts.
 *
 * The hook is silent on errors — location failures are non-critical for the
 * driver workflow and should not block the UI.
 */
export function useLocationBroadcast({
  enabled,
  intervalMs = 30_000,
}: UseLocationBroadcastOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);

  const sendLocation = useCallback(
    (position: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      // Fire-and-forget POST — we never await this in the hook
      fetch("/api/driver/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, accuracy }),
      }).catch(() => {
        // Silently swallow network errors
      });
    },
    []
  );

  const requestAndSend = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(sendLocation, () => {}, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    });
  }, [sendLocation]);

  useEffect(() => {
    if (!enabled) {
      // Clean up any running timers / watchers
      if (timerRef.current)  clearInterval(timerRef.current);
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
      timerRef.current = null;
      watchRef.current = null;
      return;
    }

    if (!navigator.geolocation) return;

    // Send immediately on activation
    requestAndSend();

    // Then send on a regular interval
    timerRef.current = setInterval(requestAndSend, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [enabled, intervalMs, requestAndSend]);
}