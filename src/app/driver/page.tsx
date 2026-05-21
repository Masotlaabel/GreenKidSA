// @ts-nocheck
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  MapPin, Clock, Weight, ChevronRight, CheckCircle2,
  Camera, AlertTriangle, Phone, Navigation, Package,
  Recycle, Leaf, Zap, X, Check, RotateCcw, Star,
  TrendingUp, Trophy, ArrowRight, Loader2, Upload,
  Truck, Briefcase, BarChart2, Map, ExternalLink,
  ChevronUp, Radio,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useDriverJobs } from "@/hooks/useDriverJobs";
import { useLocationBroadcast } from "@/hooks/useLocationBroadcast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Job {
  _id: string; address: string; location: string;
  wasteType: "general" | "organic" | "recycling" | "hazardous";
  amount: string; urgency: "low" | "normal" | "high";
  preferredDate: string; preferredTime: string;
  contactPhone: string; description: string;
  status: "assigned" | "en_route" | "arrived" | "collecting" | "completed";
  userName: string; distanceKm?: number; etaMin?: number;
}
interface DaySummary {
  completed: number; total: number; kgCollected: number;
  points: number; onTimeRate: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WASTE_META: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  general:   { label: "General",   color: "#374151", bg: "#F3F4F6", Icon: Package },
  organic:   { label: "Organic",   color: "#166534", bg: "#DCFCE7", Icon: Leaf },
  recycling: { label: "Recycling", color: "#1D4ED8", bg: "#DBEAFE", Icon: Recycle },
  hazardous: { label: "Hazardous", color: "#9A3412", bg: "#FEE2E2", Icon: Zap },
};

const URGENCY_DOT: Record<string, string> = { high: "#EF4444", normal: "#F59E0B", low: "#22C55E" };

export const CHECKLIST_ITEMS = [
  "Verify address matches job card",
  "PPE gear fitted correctly",
  "Check waste type labels on bins",
  "Confirm bin / access point available",
  "Truck positioned safely",
];

function fmtTimer(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ─── Waste type badge ─────────────────────────────────────────────────────────
function WasteTypeBadge({ type }: { type: string }) {
  const m = WASTE_META[type] ?? WASTE_META.general;
  const { Icon } = m;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: m.color, backgroundColor: m.bg }}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

// ─── ADVANCED MAP MODAL (Mapbox GL JS) ───────────────────────────────────────
/**
 * Full-screen bottom-sheet map with:
 *  • Live driver GPS dot (pulsing blue)
 *  • Job destination pin
 *  • Driving route polyline via Mapbox Directions
 *  • ETA + distance from route data
 *  • One-tap hand-off to Google Maps navigation
 */
function DriverMapModal({
  job,
  onClose,
}: {
  job: Job;
  onClose: () => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const [routeInfo, setRouteInfo]     = useState<{ distanceKm: number; etaMin: number } | null>(null);
  const [driverPos, setDriverPos]     = useState<[number, number] | null>(null);
  const [destPos, setDestPos]         = useState<[number, number] | null>(null);
  const [mapReady, setMapReady]       = useState(false);
  const [geoError, setGeoError]       = useState("");
  const watchIdRef = useRef<number | null>(null);
  const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

  // ── Load Mapbox GL JS from CDN ──────────────────────────────────────────
  const loadMapbox = useCallback((): Promise<any> => {
    return new Promise((resolve) => {
      if ((window as any).mapboxgl) { resolve((window as any).mapboxgl); return; }

      // CSS
      if (!document.getElementById("mapbox-css")) {
        const link = document.createElement("link");
        link.id = "mapbox-css";
        link.rel = "stylesheet";
        link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
        document.head.appendChild(link);
      }

      // JS
      const existing = document.getElementById("mapbox-js") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve((window as any).mapboxgl), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.id  = "mapbox-js";
      s.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
      s.onload = () => resolve((window as any).mapboxgl);
      document.head.appendChild(s);
    });
  }, []);

  // ── Geocode job address → [lng, lat] ───────────────────────────────────
  const geocodeAddress = useCallback(async (address: string): Promise<[number, number] | null> => {
    try {
      const q = encodeURIComponent(/south africa/i.test(address) ? address : `${address}, South Africa`);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${TOKEN}&country=ZA&limit=1`
      );
      const data = await res.json();
      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return [lng, lat];
      }
    } catch { /* silent */ }
    return null;
  }, [TOKEN]);

  // ── Fetch driving route from Mapbox Directions ─────────────────────────
  const fetchRoute = useCallback(async (
    mapboxgl: any,
    map: any,
    origin: [number, number],
    destination: [number, number]
  ) => {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${TOKEN}`;
      const res  = await fetch(url);
      const data = await res.json();
      const route = data.routes?.[0];
      if (!route) return;

      const distKm = +(route.distance / 1000).toFixed(1);
      const etaMin = Math.ceil(route.duration / 60);
      setRouteInfo({ distanceKm: distKm, etaMin });

      // Remove old route layer/source if it exists
      if (map.getLayer("route-line"))   map.removeLayer("route-line");
      if (map.getLayer("route-casing")) map.removeLayer("route-casing");
      if (map.getSource("route"))       map.removeSource("route");

      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route.geometry },
      });
      // Casing (white border)
      map.addLayer({
        id: "route-casing", type: "line",
        source: "route",
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
        layout: { "line-join": "round", "line-cap": "round" },
      });
      // Route line
      map.addLayer({
        id: "route-line", type: "line",
        source: "route",
        paint: { "line-color": "#10B981", "line-width": 5, "line-opacity": 1 },
        layout: { "line-join": "round", "line-cap": "round" },
      });

      // Fit bounds
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      map.fitBounds(bounds, { padding: { top: 80, bottom: 180, left: 40, right: 40 }, maxZoom: 15 });
    } catch (e) {
      console.error("Route fetch failed", e);
    }
  }, [TOKEN]);

  // ── Initialise map ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let mapInstance: any = null;

    (async () => {
      const mapboxgl = await loadMapbox();
      if (cancelled || !mapContainerRef.current) return;

      mapboxgl.accessToken = TOKEN;

      // Default centre: Pretoria
      mapInstance = new mapboxgl.Map({
        container:  mapContainerRef.current,
        style:      "mapbox://styles/mapbox/streets-v12",
        center:     [28.1871, -25.7479],
        zoom:       12,
        attributionControl: false,
      });
      mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = mapInstance;

      mapInstance.on("load", async () => {
        if (cancelled) return;
        setMapReady(true);

        // 1. Geocode destination
        const dest = await geocodeAddress(job.address);
        if (!dest || cancelled) return;
        setDestPos(dest);

        // Destination marker (green pin)
        const destEl = document.createElement("div");
        destEl.innerHTML = `
          <div style="
            width:40px;height:40px;background:#10B981;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);border:3px solid white;
            box-shadow:0 4px 12px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
          ">
            <svg style="transform:rotate(45deg)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>`;
        destEl.style.cursor = "pointer";

        new mapboxgl.Marker({ element: destEl, anchor: "bottom" })
          .setLngLat(dest)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div style="font-family:system-ui;padding:4px 0;">
              <p style="font-weight:800;font-size:13px;color:#111;margin:0 0 3px">📍 Job Destination</p>
              <p style="font-size:11px;color:#555;margin:0">${job.address}</p>
            </div>`
          ))
          .addTo(mapInstance);

        // 2. Watch driver GPS
        if (!navigator.geolocation) {
          setGeoError("GPS not available on this device.");
          mapInstance.flyTo({ center: dest, zoom: 15 });
          return;
        }

        // Driver dot element (pulsing blue)
        const driverEl = document.createElement("div");
        driverEl.innerHTML = `
          <div style="position:relative;width:22px;height:22px;">
            <div style="
              position:absolute;inset:-6px;border-radius:50%;
              background:rgba(59,130,246,0.25);
              animation:driver-ping 1.5s ease-in-out infinite;
            "></div>
            <div style="
              width:22px;height:22px;border-radius:50%;
              background:#3B82F6;border:3px solid white;
              box-shadow:0 2px 8px rgba(59,130,246,0.5);
            "></div>
          </div>`;

        // Inject ping keyframe
        if (!document.getElementById("driver-ping-style")) {
          const s = document.createElement("style");
          s.id = "driver-ping-style";
          s.textContent = `@keyframes driver-ping{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.8);opacity:0}}`;
          document.head.appendChild(s);
        }

        const driverMarker = new mapboxgl.Marker({ element: driverEl, anchor: "center" });

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelled) return;
            const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            setDriverPos(lngLat);
            driverMarker.setLngLat(lngLat).addTo(mapInstance);
            fetchRoute(mapboxgl, mapInstance, lngLat, dest);
          },
          (err) => {
            console.error("GPS error", err);
            setGeoError("GPS unavailable — showing destination only.");
            mapInstance.flyTo({ center: dest, zoom: 15 });
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      });
    })();

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (mapInstance) { mapInstance.remove(); mapRef.current = null; }
    };
  }, [job.address, loadMapbox, geocodeAddress, fetchRoute, TOKEN]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const googleMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(
    /south africa/i.test(job.address) ? job.address : `${job.address}, South Africa`
  )}&travelmode=driving`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 w-full" />

      {/* Loading overlay */}
      {!mapReady && (
        <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-3 text-white z-10">
          <Loader2 className="w-8 h-8 animate-spin text-green-400" />
          <p className="text-sm font-semibold">Loading map…</p>
        </div>
      )}

      {/* GPS error toast */}
      {geoError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />{geoError}
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-4"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate leading-tight">{job.address}</p>
          <p className="text-white/60 text-xs">Job destination</p>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-3xl overflow-hidden"
        style={{ background: "rgba(15,20,25,0.92)", backdropFilter: "blur(20px)" }}>
        {/* Route stats */}
        {routeInfo && (
          <div className="grid grid-cols-2 gap-px bg-white/10 mx-5 mt-5 mb-1 rounded-2xl overflow-hidden">
            <div className="bg-white/5 px-4 py-3 text-center">
              <p className="text-2xl font-black text-white font-mono">{routeInfo.etaMin}<span className="text-sm font-normal text-white/50 ml-1">min</span></p>
              <p className="text-[11px] text-white/50 font-semibold uppercase tracking-wide mt-0.5">ETA</p>
            </div>
            <div className="bg-white/5 px-4 py-3 text-center">
              <p className="text-2xl font-black text-white font-mono">{routeInfo.distanceKm}<span className="text-sm font-normal text-white/50 ml-1">km</span></p>
              <p className="text-[11px] text-white/50 font-semibold uppercase tracking-wide mt-0.5">Distance</p>
            </div>
          </div>
        )}
        {!routeInfo && mapReady && (
          <div className="flex items-center justify-center gap-2 py-4 text-white/50 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Calculating route…
          </div>
        )}

        {/* Driver status */}
        {driverPos && (
          <div className="flex items-center gap-2 mx-5 mt-3">
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-blue-500" />
            </span>
            <p className="text-xs text-blue-400 font-semibold">Live GPS active</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 px-5 py-4">
          <a href={googleMapsUrl} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
            <Navigation className="w-5 h-5" />
            Navigate
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
          <button onClick={onClose}
            className="px-5 py-4 rounded-2xl font-bold text-sm text-white/70 bg-white/10 hover:bg-white/15 transition-all active:scale-95">
            Close
          </button>
        </div>

        {/* Safe area spacer */}
        <div className="h-safe-area-inset-bottom" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}

// ─── Bottom tab bar (mobile-native) ──────────────────────────────────────────
function BottomTabBar({ tab, setTab, hasActiveJob }: {
  tab: string; setTab: (t: string) => void; hasActiveJob: boolean;
}) {
  const tabs = [
    { id: "jobs",  label: "Jobs",    Icon: Briefcase },
    { id: "trip",  label: "Trip",    Icon: Navigation },
    { id: "proof", label: "Proof",   Icon: Camera },
    { id: "day",   label: "My Day",  Icon: BarChart2 },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 relative transition-all ${tab === t.id ? "text-green-700" : "text-gray-400"}`}>
          <div className={`relative p-1.5 rounded-xl transition-all ${tab === t.id ? "bg-green-50" : ""}`}>
            <t.Icon className={`w-5 h-5 transition-all ${tab === t.id ? "text-green-600" : ""}`} />
            {t.id === "trip" && hasActiveJob && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <span className={`text-[10px] font-bold tracking-wide ${tab === t.id ? "text-green-700" : "text-gray-400"}`}>
            {t.label}
          </span>
          {tab === t.id && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-600 rounded-full" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ─── Resume banner ────────────────────────────────────────────────────────────
function ResumeBanner({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
        <RotateCcw className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-amber-900">Trip resumed</p>
        <p className="text-xs text-amber-700 truncate">{job.address}</p>
      </div>
      <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── PANEL: Jobs ──────────────────────────────────────────────────────────────
function JobsPanel({ jobs, loading, activeJobId, onStart, onOpenMap }: {
  jobs: Job[]; loading: boolean; activeJobId: string | null;
  onStart: (job: Job) => void; onOpenMap: (job: Job) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return (
    <div className="flex items-center justify-center h-52 gap-3 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin text-green-600" />
      <span className="text-sm font-medium">Loading jobs…</span>
    </div>
  );

  if (!jobs.length) return (
    <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-3 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <p className="font-bold text-gray-700">All done for today!</p>
      <p className="text-sm text-gray-400">No more jobs in the queue.</p>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase">
        Today's Queue — {jobs.length} job{jobs.length !== 1 ? "s" : ""}
      </p>

      {jobs.map(job => {
        const isExp    = expanded === job._id;
        const isActive = activeJobId === job._id;
        const isOther  = !!(activeJobId && activeJobId !== job._id);

        return (
          <div key={job._id}
            className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 bg-white ${
              isActive ? "border-green-500 shadow-lg shadow-green-100"
              : isOther ? "border-gray-100 opacity-40 pointer-events-none"
              : "border-gray-100 hover:border-green-200"
            }`}>
            {/* Card header */}
            <div className="flex items-center gap-3 p-4 cursor-pointer select-none"
              onClick={() => !isOther && setExpanded(isExp ? null : job._id)}>
              <div className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: URGENCY_DOT[job.urgency] }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-1">{job.address}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{job.location}</p>
              </div>
              <WasteTypeBadge type={job.wasteType} />
              <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExp ? "rotate-90" : ""}`} />
            </div>

            {/* Meta row */}
            <div className="flex gap-4 px-4 pb-3 -mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />{job.preferredTime || "Flexible"}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Weight className="w-3 h-3" />{job.amount}
              </span>
              {job.distanceKm != null && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin className="w-3 h-3" />{job.distanceKm.toFixed(1)} km
                </span>
              )}
            </div>

            {/* Expanded actions */}
            {isExp && (
              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/70 space-y-3">
                {job.description && (
                  <p className="text-xs text-gray-600 leading-relaxed">{job.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {/* Start Trip — primary full-width */}
                  <button
                    onClick={e => { e.stopPropagation(); onStart(job); }}
                    disabled={!!activeJobId}
                    className="col-span-2 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm text-white transition-all active:scale-98 disabled:opacity-40"
                    style={{ background: activeJobId ? "#D1D5DB" : "linear-gradient(135deg,#16a34a,#059669)" }}>
                    <Navigation className="w-4 h-4" />Start Trip
                  </button>
                  {/* View Map */}
                  <button
                    onClick={e => { e.stopPropagation(); onOpenMap(job); }}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-green-200 bg-white text-sm font-bold text-green-700 hover:bg-green-50 transition-colors active:scale-98">
                    <Map className="w-4 h-4" />Map
                  </button>
                  {/* Call */}
                  {job.contactPhone ? (
                    <a href={`tel:${job.contactPhone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors active:scale-98">
                      <Phone className="w-4 h-4" />Call
                    </a>
                  ) : (
                    <div className="flex items-center justify-center py-3 rounded-xl border border-gray-100 bg-gray-50 text-xs text-gray-400">
                      No phone
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Active bar */}
            {isActive && (
              <div className="bg-green-600 text-white text-[11px] font-black text-center py-2 tracking-widest flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
                ACTIVE — IN PROGRESS
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PANEL: Trip ──────────────────────────────────────────────────────────────
function TripPanel({ job, elapsed, checks, onToggleCheck, onArrived, onReportIssue, onOpenMap }: {
  job: Job | null; elapsed: number; checks: boolean[];
  onToggleCheck: (i: number) => void; onArrived: () => void;
  onReportIssue: () => void; onOpenMap: (job: Job) => void;
}) {
  if (!job) return (
    <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-3 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
        <Navigation className="w-8 h-8 text-gray-200" />
      </div>
      <p className="font-bold text-gray-600">No active trip</p>
      <p className="text-sm text-gray-400">Select a job and tap "Start Trip".</p>
    </div>
  );

  const checkedCount = checks.filter(Boolean).length;
  const canArrive = checkedCount >= 3;

  return (
    <div className="p-4 space-y-4">
      {/* Active job banner */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%)" }}>
        <div className="px-5 py-4">
          <p className="text-[10px] font-black tracking-widest text-green-300/70 mb-1 uppercase">Active Job</p>
          <p className="font-bold text-white text-base leading-snug mb-4">{job.address}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "ETA",      value: job.etaMin != null ? `${job.etaMin}m` : "—" },
              { label: "Distance", value: job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km` : "—" },
              { label: "Elapsed",  value: fmtTimer(elapsed) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-xl px-3 py-3 text-center">
                <p className="font-mono text-lg font-black text-white">{value}</p>
                <p className="text-[10px] text-green-300/60 mt-0.5 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Map button — prominent, inside banner */}
        <button
          onClick={() => onOpenMap(job)}
          className="w-full flex items-center justify-center gap-2 py-3.5 font-black text-sm text-white bg-white/10 hover:bg-white/20 transition-colors border-t border-white/10 active:bg-white/25">
          <Map className="w-4 h-4" />
          View Route Map
          <ArrowRight className="w-4 h-4 opacity-60" />
        </button>
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-wide ${
          job.status === "collecting" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
          {job.status === "collecting" ? "AT LOCATION — COLLECTING" : "EN ROUTE"}
        </span>
      </div>

      {/* Checklist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase">Pre-Arrival Checklist</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            checkedCount >= 3 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>{checkedCount}/{CHECKLIST_ITEMS.length}</span>
        </div>
        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item, i) => (
            <li key={i} onClick={() => onToggleCheck(i)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                checks[i] ? "border-green-200 bg-green-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                checks[i] ? "bg-green-600 border-green-600" : "border-gray-300"
              }`}>
                {checks[i] && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={`text-sm leading-snug ${checks[i] ? "text-green-800 font-medium" : "text-gray-700"}`}>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onArrived} disabled={!canArrive}
        className="w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-98"
        style={{
          background: canArrive ? "linear-gradient(135deg,#16a34a,#059669)" : undefined,
          backgroundColor: canArrive ? undefined : "#F3F4F6",
          color: canArrive ? "white" : "#9CA3AF",
        }}>
        <CheckCircle2 className="w-4 h-4" />
        {canArrive ? "Mark Arrived & Start Collection" : `Complete ${3 - checkedCount} more item${3 - checkedCount !== 1 ? "s" : ""}`}
      </button>

      <button onClick={onReportIssue}
        className="w-full py-3.5 rounded-2xl font-bold text-sm border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-2 active:scale-98">
        <AlertTriangle className="w-4 h-4" />Report Issue
      </button>
    </div>
  );
}

// ─── PANEL: Proof ─────────────────────────────────────────────────────────────
function ProofPanel({ job, onComplete }: {
  job: Job | null; onComplete: (data: { weight: number; notes: string; imageUrls: string[] }) => void;
}) {
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string; url?: string }[]>([]);
  const [sigCaptured, setSigCaptured] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadToS3 = async (file: File): Promise<string> => {
    const res = await fetch("/api/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, fileType: file.type }) });
    const { uploadUrl, publicUrl } = await res.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return publicUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 5) { alert("Maximum 5 photos allowed"); return; }
    setUploading(true);
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      setPhotos(prev => [...prev, { file, preview }]);
      try { const url = await uploadToS3(file); setPhotos(prev => prev.map(p => p.preview === preview ? { ...p, url } : p)); }
      catch { console.error("Upload failed for", file.name); }
    }
    setUploading(false); e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!weight || parseFloat(weight) <= 0) { alert("Please enter the weight."); return; }
    if (photos.length < 1) { alert("At least one photo required."); return; }
    const imageUrls = photos.map(p => p.url).filter(Boolean) as string[];
    setSubmitting(true);
    await onComplete({ weight: parseFloat(weight), notes, imageUrls });
    setSubmitting(false);
  };

  if (!job) return (
    <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-3 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
        <Camera className="w-8 h-8 text-gray-200" />
      </div>
      <p className="font-bold text-gray-600">No active job</p>
      <p className="text-sm">Start a trip to unlock proof capture.</p>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <p className="text-[10px] font-black tracking-widest text-green-500 uppercase mb-0.5">Proving collection at</p>
        <p className="font-bold text-green-900 text-sm">{job.address}</p>
      </div>

      {/* Photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase">Photos ({photos.length}/5)</p>
          <span className="text-xs text-gray-400">Before &amp; After required</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handleFileChange} className="hidden" />
        {photos.length < 5 && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full border-2 border-dashed border-gray-200 hover:border-green-400 rounded-2xl py-6 flex flex-col items-center gap-2 text-gray-400 hover:text-green-600 transition-all mb-3 disabled:opacity-50 bg-gray-50/50">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-7 h-7" />}
            <span className="text-sm font-bold">{uploading ? "Uploading…" : "Tap to capture photo"}</span>
            <span className="text-xs text-gray-400">JPG / PNG · max 10 MB each</span>
          </button>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {photos.map(p => (
              <div key={p.preview} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                <img src={p.preview} alt="proof" className="w-full h-full object-cover" />
                {!p.url && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                {p.url && <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                <button onClick={() => setPhotos(prev => prev.filter(x => x.preview !== p.preview))}
                  className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weight */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Weight Collected</p>
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-green-400/40 focus-within:border-green-400 transition-all">
          <Weight className="w-5 h-5 text-green-600 flex-shrink-0" />
          <input type="number" min="0" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
            placeholder="0.0" className="flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none placeholder-gray-300 w-16" />
          <span className="text-gray-500 font-bold">kg</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Notes for Dispatcher</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any issues, access problems, or extra info…" rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 resize-none placeholder-gray-400 transition-all" />
      </div>

      {/* Signature */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Resident Signature</p>
        {!sigCaptured ? (
          <button onClick={() => setSigCaptured(true)}
            className="w-full border-2 border-dashed border-gray-200 hover:border-green-400 rounded-xl py-4 text-sm text-gray-400 hover:text-green-600 transition-all flex items-center justify-center gap-2 bg-gray-50/50">
            ✍ Tap to capture resident signature
          </button>
        ) : (
          <div className="flex items-center gap-2 border border-green-300 bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm font-bold text-green-800 flex-1">Signature captured</span>
            <button onClick={() => setSigCaptured(false)} className="text-green-600 hover:text-green-800"><RotateCcw className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <button onClick={handleSubmit} disabled={submitting || uploading}
        className="w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 active:scale-98"
        style={{
          background: submitting || uploading ? undefined : "linear-gradient(135deg,#16a34a,#059669)",
          backgroundColor: submitting || uploading ? "#F3F4F6" : undefined,
          color: submitting || uploading ? "#9CA3AF" : "white",
        }}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {submitting ? "Submitting…" : "Submit & Complete Job"}
      </button>
    </div>
  );
}

// ─── PANEL: My Day ────────────────────────────────────────────────────────────
function DayPanel({ summary, jobs }: { summary: DaySummary; jobs: Job[] }) {
  const stats = [
    { label: "Jobs Done",    value: `${summary.completed}/${summary.total}`, Icon: CheckCircle2, color: "#10B981", bg: "#F0FDF9" },
    { label: "Kg Collected", value: `${summary.kgCollected.toFixed(1)}`,     Icon: Weight,       color: "#3B82F6", bg: "#EFF6FF" },
    { label: "Points",       value: `${summary.points}`,                     Icon: Star,         color: "#F59E0B", bg: "#FFFBEB" },
    { label: "On-Time",      value: `${summary.onTimeRate}%`,                Icon: TrendingUp,   color: "#8B5CF6", bg: "#F5F3FF" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-2" style={{ backgroundColor: bg }}>
            <Icon className="w-5 h-5" style={{ color }} />
            <p className="text-2xl font-black text-gray-900 font-mono leading-none">{value}</p>
            <p className="text-xs text-gray-500 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/*<div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl px-4 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-black text-amber-900">You're in the top 10%</p>
          <p className="text-xs text-amber-700">Keep it up to claim your weekly bonus!</p>
        </div>
      </div>*/}

      {/* Route progress */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-4">Route Progress</p>
        <div className="space-y-0">
          {[
            { label: "Depot — Start of shift", time: "06:45", done: true },
            ...jobs.map(j => ({
              label:  j.address,
              time:   j.preferredTime || "—",
              done:   j.status === "completed",
              active: j.status !== "completed" && j.status !== "assigned",
            })),
            { label: "Depot — End of shift", time: "Est. 16:00", done: false },
          ].map((item, i, arr) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 z-10 ${
                  item.done ? "bg-green-600 border-green-600"
                  : (item as any).active ? "bg-amber-400 border-amber-500"
                  : "bg-white border-gray-200"
                }`}>
                  {item.done && <Check className="w-3 h-3 text-white" />}
                </div>
                {i < arr.length - 1 && (
                  <div className={`w-0.5 h-8 mt-1 ${item.done ? "bg-green-200" : "bg-gray-100"}`} />
                )}
              </div>
              <div className="pb-5 flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${item.done ? "text-green-800" : "text-gray-700"}`}>{item.label}</p>
                <p className="text-xs text-gray-400">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Completion overlay ────────────────────────────────────────────────────────
function CompletionOverlay({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-green-900 to-emerald-700 flex flex-col items-center justify-center gap-5 text-white text-center px-8">
      <div className="text-7xl animate-bounce">🎉</div>
      <h2 className="text-3xl font-black">Job Complete!</h2>
      <p className="text-green-200 text-sm max-w-xs leading-relaxed">Proof submitted and dispatcher notified. Points added to your total.</p>
      <button onClick={onDone}
        className="mt-2 px-8 py-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 font-bold transition-colors active:scale-98">
        Back to Jobs
      </button>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DriverPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const {
    jobs, summary, loading: jobsLoading,
    activeJob, checks, elapsed, restoredTab,
    startTrip, markArrived, completeJob, reportIssue, toggleCheck, saveTab,
  } = useDriverJobs();

  const [tab, setTab]                 = useState("jobs");
  const [showComplete, setShowComplete] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [mapJob, setMapJob]           = useState<Job | null>(null);

  useLocationBroadcast({ enabled: !!activeJob });

  useEffect(() => { if (!authLoading && !user) router.push("/"); }, [user, authLoading, router]);

  useEffect(() => {
    if (restoredTab) {
      setTab(restoredTab);
      setShowResumeBanner(true);
      const t = setTimeout(() => setShowResumeBanner(false), 4000);
      return () => clearTimeout(t);
    }
  }, [restoredTab]);

  const handleSetTab = (t: string) => { setTab(t); saveTab(t); };

  const handleStartTrip = async (job: Job) => {
    await startTrip(job);
    handleSetTab("trip");
  };

  const handleArrived = async () => {
    if (!activeJob) return;
    await markArrived(activeJob._id);
    handleSetTab("proof");
  };

  const handleComplete = async (data: { weight: number; notes: string; imageUrls: string[] }) => {
    if (!activeJob) return;
    await completeJob(activeJob._id, data);
    setShowComplete(true);
  };

  const handleDone = () => { setShowComplete(false); handleSetTab("jobs"); };

  const handleReportIssue = async () => {
    if (!activeJob) return;
    const issue = prompt("Briefly describe the issue:");
    if (!issue) return;
    await reportIssue(activeJob._id, issue);
    alert("Issue reported to dispatcher.");
  };

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-green-600" />
    </div>
  );
  if (!user) return null;

  const parts    = user.name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
  const completionPct = summary.total > 0 ? Math.round(summary.completed / summary.total * 100) : 0;

  return (
    <>
      {/* Map modal — rendered outside the page container so it can be truly full-screen */}
      {mapJob && <DriverMapModal job={mapJob} onClose={() => setMapJob(null)} />}

      {showComplete && <CompletionOverlay onDone={handleDone} />}

      <div className="min-h-screen bg-gray-50 flex flex-col" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>

        {/* ── Header ── */}
        <header className="sticky top-0 z-20 mt-20" style={{ background: "linear-gradient(135deg,#14532d 0%,#166534 60%,#15803d 100%)" }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center font-black text-sm flex-shrink-0 border-2 border-white/30">
                  {initials}
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">{user.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-green-300 text-xs font-medium">Driver</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeJob ? "bg-amber-400/20 text-amber-300" : "bg-green-400/20 text-green-300"}`}>
                      {activeJob ? "● On Job" : "● Ready"}
                    </span>
                    {activeJob && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-400/20 text-blue-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse inline-block" />
                        GPS On
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-mono font-bold text-base">
                  {new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-green-300 text-xs mt-0.5">
                  {new Date().toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-green-300 text-xs font-medium">Daily Progress</span>
                <span className="text-white text-xs font-bold">{summary.completed}/{summary.total} jobs</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div className="h-1.5 bg-white rounded-full transition-all duration-700" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
          </div>
        </header>

        {/* ── Resume banner ── */}
        {showResumeBanner && activeJob && (
          <ResumeBanner job={activeJob as any} onDismiss={() => setShowResumeBanner(false)} />
        )}

        {/* ── Active job quick-access strip ── */}
        {activeJob && tab === "jobs" && (
          <div className="max-w-2xl mx-auto w-full px-4 pt-3">
            <button
              onClick={() => handleSetTab("trip")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-white font-bold text-sm active:scale-98 transition-all"
              style={{ background: "linear-gradient(135deg,#16a34a,#059669)" }}>
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse flex-shrink-0" />
              <span className="flex-1 text-left truncate">Active: {(activeJob as any).address}</span>
              <ChevronRight className="w-4 h-4 opacity-70 flex-shrink-0" />
            </button>
          </div>
        )}

        {/* ── Panel content ── */}
        <main className="flex-1 max-w-2xl mx-auto w-full">
          {tab === "jobs"  && (
            <JobsPanel
              jobs={jobs as any[]}
              loading={jobsLoading}
              activeJobId={activeJob?._id ?? null}
              onStart={handleStartTrip}
              onOpenMap={job => setMapJob(job as any)}
            />
          )}
          {tab === "trip"  && (
            <TripPanel
              job={activeJob as any}
              elapsed={elapsed}
              checks={checks}
              onToggleCheck={toggleCheck}
              onArrived={handleArrived}
              onReportIssue={handleReportIssue}
              onOpenMap={job => setMapJob(job as any)}
            />
          )}
          {tab === "proof" && <ProofPanel job={activeJob as any} onComplete={handleComplete} />}
          {tab === "day"   && <DayPanel summary={summary as any} jobs={jobs as any[]} />}
        </main>

        {/* ── Bottom tab bar ── */}
        <BottomTabBar tab={tab} setTab={handleSetTab} hasActiveJob={!!activeJob} />
      </div>
    </>
  );
}