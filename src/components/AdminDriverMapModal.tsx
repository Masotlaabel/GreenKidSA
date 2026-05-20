// @ts-nocheck
"use client";

/**
 * AdminDriverMapModal
 *
 * Renders a full-screen modal with a Leaflet map showing:
 *   • A coloured marker for every driver whose location has been broadcast.
 *   • A pulsing ring on drivers with an active job.
 *   • A destination pin for each active job's address (geocoded on the fly
 *     via OpenStreetMap Nominatim — free, no API key needed).
 *   • A dashed polyline from driver → job destination.
 *   • A sidebar legend with driver details + staleness warning.
 *
 * Props
 * ─────
 *  open       – controls visibility
 *  onClose    – called when the modal is dismissed
 *
 * The component dynamically imports Leaflet so it never runs on the server.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, MapPin, Navigation, Clock, AlertTriangle,
  Loader2, RefreshCw, Users, Wifi, WifiOff,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DriverLocation {
  userId:     string;
  driverName: string;
  lat:        number;
  lng:        number;
  accuracy:   number | null;
  updatedAt:  string;
  isStale:    boolean;
  ageSeconds: number;
  activeJob: {
    requestId: string;
    address:   string;
    location:  string | null; // "lat,lng" string if pre-geocoded
    status:    string;
    userName:  string;
  } | null;
}

interface GeocodedJob {
  requestId: string;
  address:   string;
  lat:       number;
  lng:       number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const DRIVER_COLORS = [
  "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6",
  "#EF4444", "#EC4899", "#14B8A6", "#F97316",
];

function driverColor(index: number) {
  return DRIVER_COLORS[index % DRIVER_COLORS.length];
}

// Bounding box for South Africa (lat: -35 to -22, lng: 16 to 33)
const SA_BOUNDS = { minLat: -35, maxLat: -22, minLng: 16, maxLng: 33 };

function isInSouthAfrica(lat: number, lng: number): boolean {
  return (
    lat >= SA_BOUNDS.minLat && lat <= SA_BOUNDS.maxLat &&
    lng >= SA_BOUNDS.minLng && lng <= SA_BOUNDS.maxLng
  );
}

/**
 * Geocode a plain-text address using Nominatim, restricted to South Africa.
 * Returns null if the result falls outside SA or on any failure.
 */
async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    // Always append ", South Africa" if not already present, and use
    // countrycodes=za so Nominatim only searches within South Africa.
    const normalized = /south africa/i.test(address)
      ? address
      : `${address}, South Africa`;
    const q = encodeURIComponent(normalized);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=za`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      // Reject anything outside SA even if countrycodes is somehow ignored.
      if (!isInSouthAfrica(lat, lng)) return null;
      return { lat, lng };
    }
  } catch { /* silent */ }
  return null;
}

// ─── Map component (Leaflet, dynamically loaded) ───────────────────────────────
function LiveMap({
  locations,
  geocodedJobs,
}: {
  locations: DriverLocation[];
  geocodedJobs: GeocodedJob[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const layersRef    = useRef<any[]>([]);

  // Bootstrap Leaflet CSS once
  useEffect(() => {
    if (document.getElementById("leaflet-css")) return;
    const link = document.createElement("link");
    link.id   = "leaflet-css";
    link.rel  = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }, []);

  // Initialise the map once
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any previous instance bound to this DOM node (strict-mode / HMR)
    if ((containerRef.current as any)._leaflet_id != null) {
      (containerRef.current as any)._leaflet_id = null;
    }
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    let cancelled = false;
    let L: any;

    (async () => {
      // @ts-ignore — dynamic import from CDN bundle
      if (!(window as any).L) {
        await new Promise<void>((resolve) => {
          // Re-use an existing script tag if one is already loading
          if (document.getElementById("leaflet-js")) {
            const existing = document.getElementById("leaflet-js") as HTMLScriptElement;
            if (existing.dataset.loaded) { resolve(); return; }
            existing.addEventListener("load", () => resolve(), { once: true });
            return;
          }
          const s = document.createElement("script");
          s.id  = "leaflet-js";
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.onload = () => { s.dataset.loaded = "1"; resolve(); };
          document.head.appendChild(s);
        });
      }

      if (cancelled || !containerRef.current) return;

      L = (window as any).L;

      // Final guard: if the container was already claimed between the await
      // and now, bail out rather than throw.
      if ((containerRef.current as any)._leaflet_id != null) return;

      // SA bounding box used as maxBounds so the map can't pan off-continent
      const saBounds = L.latLngBounds(
        L.latLng(-35, 16),  // SW corner
        L.latLng(-22, 33)   // NE corner
      );
      mapRef.current = L.map(containerRef.current, {
        zoomControl:        true,
        attributionControl: false,
        maxBounds:          saBounds,
        maxBoundsViscosity: 1.0,   // hard clamp — can't drag outside SA
      }).setView([-29.0, 25.0], 6); // Default: centre of South Africa

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(mapRef.current);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Re-render markers whenever data changes
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    // Remove old layers
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    const bounds: [number, number][] = [];

    locations.forEach((driver, idx) => {
      const color = driverColor(idx);

      // Driver marker — custom div icon with pulsing ring if active
      const hasJob = !!driver.activeJob;
      const isStale = driver.isStale;

      const html = `
        <div style="position:relative;width:36px;height:36px;">
          ${hasJob && !isStale ? `
            <span style="
              position:absolute;inset:-4px;border-radius:50%;
              border:2px solid ${color};
              animation:ping 1.2s cubic-bezier(0,0,0.2,1) infinite;
              opacity:0.5;
            "></span>` : ""}
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${isStale ? "#9CA3AF" : color};
            border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-weight:900;color:white;
            font-family:system-ui,sans-serif;letter-spacing:-0.5px;
          ">${driver.driverName.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()}</div>
        </div>`;

      const driverIcon = L.divIcon({
        html,
        className: "",
        iconSize:  [36, 36],
        iconAnchor:[18, 18],
      });

      const marker = L.marker([driver.lat, driver.lng], { icon: driverIcon });

      const popupContent = `
        <div style="font-family:system-ui,sans-serif;min-width:160px;">
          <p style="font-weight:900;font-size:14px;color:#111;margin:0 0 4px;">
            ${driver.driverName}
          </p>
          <p style="font-size:11px;color:${isStale ? "#EF4444" : "#10B981"};font-weight:700;margin:0 0 6px;">
            ${isStale ? "⚠ Stale — " + timeAgo(driver.updatedAt) : "● Live — " + timeAgo(driver.updatedAt)}
          </p>
          ${driver.activeJob ? `
            <div style="font-size:11px;color:#374151;background:#F9FAFB;padding:6px 8px;border-radius:6px;">
              <b>Job:</b> ${driver.activeJob.address}<br>
              <b>Status:</b> ${driver.activeJob.status}<br>
              <b>For:</b> ${driver.activeJob.userName}
            </div>` : `<p style="font-size:11px;color:#9CA3AF;">No active job</p>`}
        </div>`;

      marker.bindPopup(popupContent).addTo(mapRef.current);
      layersRef.current.push(marker);
      bounds.push([driver.lat, driver.lng]);

      // Draw polyline from driver to job destination if geocoded
      if (driver.activeJob) {
        const jobGeo = geocodedJobs.find(
          (j) => j.requestId === driver.activeJob!.requestId
        );
        if (jobGeo) {
          const line = L.polyline(
            [[driver.lat, driver.lng], [jobGeo.lat, jobGeo.lng]],
            { color, weight: 2.5, dashArray: "6 6", opacity: 0.75 }
          ).addTo(mapRef.current);
          layersRef.current.push(line);

          // Job destination pin
          const destHtml = `
            <div style="
              width:28px;height:28px;border-radius:6px;
              background:${color};
              border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);
              display:flex;align-items:center;justify-content:center;
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>`;

          const destIcon = L.divIcon({
            html:      destHtml,
            className: "",
            iconSize:  [28, 28],
            iconAnchor:[14, 28],
          });

          const destMarker = L.marker([jobGeo.lat, jobGeo.lng], { icon: destIcon });
          destMarker.bindPopup(`
            <div style="font-family:system-ui,sans-serif;">
              <p style="font-weight:700;font-size:13px;margin:0 0 3px;">📍 Job Destination</p>
              <p style="font-size:11px;color:#374151;margin:0;">${driver.activeJob!.address}</p>
              <p style="font-size:11px;color:#6B7280;margin:4px 0 0;">For: ${driver.activeJob!.userName}</p>
            </div>`
          ).addTo(mapRef.current);
          layersRef.current.push(destMarker);
          bounds.push([jobGeo.lat, jobGeo.lng]);
        }
      }
    });

    // Fit map to show all markers — filter to SA coords first so a bad
    // geocode result can't send the view to another continent.
    const saBounds = bounds.filter(([lat, lng]) => isInSouthAfrica(lat, lng));
    if (saBounds.length > 0) {
      mapRef.current.fitBounds(saBounds, { padding: [40, 40], maxZoom: 15 });
    }

    // Inject keyframe for ping animation
    if (!document.getElementById("leaflet-ping-style")) {
      const style = document.createElement("style");
      style.id = "leaflet-ping-style";
      style.textContent = `
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }`;
      document.head.appendChild(style);
    }
  }, [locations, geocodedJobs]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl"
      style={{ minHeight: "300px" }}
    />
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────
export function AdminDriverMapModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [locations, setLocations]     = useState<DriverLocation[]>([]);
  const [geocodedJobs, setGeocodedJobs] = useState<GeocodedJob[]>([]);
  const [loading, setLoading]         = useState(false);
  const [lastFetch, setLastFetch]     = useState<Date | null>(null);
  const geocacheRef                   = useRef<Record<string, { lat: number; lng: number }>>({});
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/drivers/locations");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const locs: DriverLocation[] = data.locations ?? [];
      setLocations(locs);
      setLastFetch(new Date());

      // Geocode job addresses we haven't seen before
      const toGeocode = locs
        .filter((d) => d.activeJob && !geocacheRef.current[d.activeJob.requestId])
        .map((d) => d.activeJob!);

      const newGeo: GeocodedJob[] = [];

      for (const job of toGeocode) {
        // Try pre-geocoded "lat,lng" field first
        if (job.location) {
          const parts = job.location.split(",");
          if (parts.length === 2) {
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              geocacheRef.current[job.requestId] = { lat, lng };
              newGeo.push({ requestId: job.requestId, address: job.address, lat, lng });
              continue;
            }
          }
        }
        // Fall back to Nominatim
        const coords = await geocodeAddress(job.address);
        if (coords) {
          geocacheRef.current[job.requestId] = coords;
          newGeo.push({ requestId: job.requestId, address: job.address, ...coords });
        }
        // Throttle requests
        await new Promise((r) => setTimeout(r, 300));
      }

      if (newGeo.length > 0) {
        setGeocodedJobs((prev) => {
          const ids = new Set(prev.map((g) => g.requestId));
          return [...prev, ...newGeo.filter((g) => !ids.has(g.requestId))];
        });
      }
    } catch (e) {
      console.error("Driver locations fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open, then poll every 20 s
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    fetchLocations();
    pollRef.current = setInterval(fetchLocations, 20_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchLocations]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const activeCount = locations.filter((l) => l.activeJob).length;
  const staleCount  = locations.filter((l) => l.isStale).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl h-[92vh] sm:h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Navigation className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 text-base leading-tight">Live Driver Map</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {locations.length} driver{locations.length !== 1 ? "s" : ""} tracked
              {activeCount > 0 && ` · ${activeCount} on job`}
              {staleCount > 0 && ` · ${staleCount} stale`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastFetch && (
              <span className="text-[11px] text-gray-400 hidden sm:block">
                Updated {lastFetch.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchLocations}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: sidebar + map */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 overflow-y-auto hidden sm:flex flex-col">
            {loading && locations.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin text-green-600 mr-2" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : locations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 p-6 text-center gap-2">
                <Users className="w-8 h-8 opacity-30" />
                <p className="text-sm font-semibold">No driver locations yet</p>
                <p className="text-xs">Drivers broadcast their position automatically when on a job.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {locations.map((driver, idx) => {
                  const color = driverColor(idx);
                  const initials = driver.driverName
                    .split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <div key={driver.userId} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div
                          className="w-8 h-8 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: driver.isStale ? "#9CA3AF" : color }}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{driver.driverName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {driver.isStale
                              ? <WifiOff className="w-3 h-3 text-gray-400" />
                              : <Wifi className="w-3 h-3 text-green-500" />}
                            <span className={`text-[11px] font-semibold ${driver.isStale ? "text-gray-400" : "text-green-600"}`}>
                              {driver.isStale ? "Stale" : "Live"} · {timeAgo(driver.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {driver.isStale && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mb-2">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          Location may be outdated
                        </div>
                      )}
                      {driver.activeJob ? (
                        <div className="rounded-lg bg-gray-50 px-3 py-2 space-y-0.5">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Job</p>
                          <p className="text-xs font-semibold text-gray-800 leading-snug truncate">{driver.activeJob.address}</p>
                          <p className="text-[11px] text-gray-500 truncate">For: {driver.activeJob.userName}</p>
                          <span className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                            driver.activeJob.status === "collecting"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}>
                            {driver.activeJob.status.toUpperCase().replace("_", " ")}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 italic">No active job</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            {loading && locations.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <p className="text-sm font-medium">Fetching driver locations…</p>
              </div>
            ) : locations.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-3 text-center px-8">
                <MapPin className="w-12 h-12 text-gray-200" />
                <p className="font-bold text-gray-500">No driver locations to display</p>
                <p className="text-sm text-gray-400 max-w-xs">
                  Drivers share their GPS position automatically when they have an active job.
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 p-3">
                <LiveMap locations={locations} geocodedJobs={geocodedJobs} />
              </div>
            )}
            {loading && locations.length > 0 && (
              <div className="absolute top-5 right-5 bg-white shadow-md rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-gray-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-green-600" />
                Updating…
              </div>
            )}
          </div>
        </div>

        {/* Mobile driver list (shown below map on small screens) */}
        <div className="sm:hidden border-t border-gray-100 max-h-40 overflow-y-auto">
          {locations.map((driver, idx) => (
            <div key={driver.userId} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50">
              <div
                className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: driver.isStale ? "#9CA3AF" : driverColor(idx) }}
              >
                {driver.driverName.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-xs truncate">{driver.driverName}</p>
                <p className="text-[11px] text-gray-400">{driver.isStale ? "⚠ Stale" : "● Live"} · {timeAgo(driver.updatedAt)}</p>
              </div>
              {driver.activeJob && (
                <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">On Job</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}