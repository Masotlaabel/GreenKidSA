// @ts-nocheck
"use client";
/**
 * Driver Page — updated to:
 *   1. Broadcast GPS location to /api/driver/location while a job is active
 *      (via the useLocationBroadcast hook).
 *   2. Show an "Open Map" button on each job card that opens the request
 *      address in Google Maps (already existed) AND an inline mini-map
 *      modal when the driver taps the map icon on the Trip panel.
 *
 * Search for ★ to find every change from the original.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  MapPin, Clock, Weight, ChevronRight, CheckCircle2,
  Camera, AlertTriangle, Phone, Navigation, Package,
  Recycle, Leaf, Zap, X, Check, RotateCcw, Star,
  TrendingUp, Trophy, ArrowRight, Loader2, Upload,
  Truck, Briefcase, BarChart2, Map, // ★ added Map
} from "lucide-react";
import { useDriverJobs } from "@/hooks/useDriverJobs";
import { useLocationBroadcast } from "@/hooks/useLocationBroadcast"; // ★

// ─── Types ────────────────────────────────────────────────────────────────────
interface Job {
  _id: string; address: string; location: string;
  wasteType: "general"|"organic"|"recycling"|"hazardous";
  amount: string; urgency: "low"|"normal"|"high";
  preferredDate: string; preferredTime: string;
  contactPhone: string; description: string;
  status: "assigned"|"en_route"|"arrived"|"collecting"|"completed";
  userName: string; distanceKm?: number; etaMin?: number;
}
interface DaySummary {
  completed: number; total: number; kgCollected: number;
  points: number; onTimeRate: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WASTE_META: Record<string, { label:string; color:string; bg:string; Icon:any }> = {
  general:   { label:"General",   color:"#374151", bg:"#F3F4F6", Icon:Package },
  organic:   { label:"Organic",   color:"#166534", bg:"#DCFCE7", Icon:Leaf },
  recycling: { label:"Recycling", color:"#1D4ED8", bg:"#DBEAFE", Icon:Recycle },
  hazardous: { label:"Hazardous", color:"#9A3412", bg:"#FEE2E2", Icon:Zap },
};

const URGENCY_DOT: Record<string, string> = { high:"#EF4444", normal:"#F59E0B", low:"#22C55E" };

export const CHECKLIST_ITEMS = [
  "Verify address matches job card",
  "PPE gear fitted correctly",
  "Check waste type labels on bins",
  "Confirm bin / access point available",
  "Truck positioned safely",
];

function fmtTimer(s: number) {
  return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
}

function WasteTypeBadge({ type }: { type: string }) {
  const m = WASTE_META[type] ?? WASTE_META.general;
  const { Icon } = m;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color:m.color, backgroundColor:m.bg }}>
      <Icon className="w-3 h-3"/>{m.label}
    </span>
  );
}

// ★ ─── Inline job map modal ────────────────────────────────────────────────────
/**
 * Opens an OpenStreetMap iframe centred on a geocoded address.
 * No API key needed.
 */
function JobMapModal({ address, onClose }: { address: string; onClose: () => void }) {
  const encodedAddress = encodeURIComponent(address);
  // Use OpenStreetMap embed — works without an API key
  const osmSearchUrl = `https://www.openstreetmap.org/search?query=${encodedAddress}#map=16`;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ height: "80vh" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{address}</p>
            <p className="text-xs text-gray-400">Job destination</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map iframe */}
        <div className="flex-1 relative">
          <iframe
            title="Job location map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=16%2C-35%2C33%2C-22&layer=mapnik&query=${encodedAddress}`}
            className="w-full h-full border-0"
            loading="lazy"
          />
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50">
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(/south africa/i.test(address) ? address : address + ", South Africa")}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
          >
            <Navigation className="w-4 h-4" />
            Open in Google Maps
          </a>
          <a
            href={osmSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-bold text-gray-700 transition-colors"
          >
            <Map className="w-4 h-4" />
            OSM
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tab, setTab, hasActiveJob }: { tab:string; setTab:(t:string)=>void; hasActiveJob:boolean }) {
  const tabs = [
    { id:"jobs",  label:"Jobs",     Icon:Briefcase },
    { id:"trip",  label:"Trip",     Icon:Navigation },
    { id:"proof", label:"Proof",    Icon:Camera },
    { id:"day",   label:"My Day",   Icon:BarChart2 },
  ];
  return (
    <div className="flex border-b border-gray-100 bg-white">
      {tabs.map(t => (
        <button key={t.id} onClick={()=>setTab(t.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-bold tracking-wide transition-all relative ${
            tab===t.id ? "text-green-700" : "text-gray-400 hover:text-gray-600"
          }`}>
          <t.Icon className={`w-4 h-4 ${tab===t.id ? "text-green-600" : ""}`}/>
          {t.label.toUpperCase()}
          {tab===t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-600 rounded-full"/>}
          {t.id==="trip" && hasActiveJob && (
            <span className="absolute top-2 right-1/4 w-2 h-2 bg-green-500 rounded-full border-2 border-white"/>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Resume Banner ─────────────────────────────────────────────────────────────
function ResumeBanner({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  return (
    <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 shadow-sm">
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
        <RotateCcw className="w-4 h-4 text-amber-600"/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-amber-900">Trip resumed</p>
        <p className="text-xs text-amber-700 truncate">{job.address}</p>
      </div>
      <button onClick={onDismiss} className="text-amber-500 hover:text-amber-700 flex-shrink-0">
        <X className="w-4 h-4"/>
      </button>
    </div>
  );
}

// ─── PANEL: Jobs ──────────────────────────────────────────────────────────────
function JobsPanel({ jobs, loading, activeJobId, onStart }: {
  jobs:Job[]; loading:boolean; activeJobId:string|null; onStart:(job:Job)=>void;
}) {
  const [expanded, setExpanded] = useState<string|null>(null);
  const [mapJob, setMapJob] = useState<Job|null>(null); // ★

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-green-600"/>
      <span className="text-sm font-medium">Loading jobs…</span>
    </div>
  );

  if (!jobs.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2 p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-1">
        <CheckCircle2 className="w-7 h-7 text-green-400"/>
      </div>
      <p className="font-bold text-gray-700">All done for today!</p>
      <p className="text-sm text-gray-400">No more jobs in the queue.</p>
    </div>
  );

  return (
    <>
      {/* ★ Job map modal */}
      {mapJob && <JobMapModal address={mapJob.address} onClose={() => setMapJob(null)} />}

      <div className="p-4 space-y-3">
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase">
          Today's Queue — {jobs.length} job{jobs.length!==1?"s":""}
        </p>
        {jobs.map(job => {
          const isExp = expanded===job._id;
          const isActive = activeJobId===job._id;
          const isOther = activeJobId && activeJobId!==job._id;
          return (
            <div key={job._id}
              className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                isActive ? "border-green-500 border-2 shadow-lg shadow-green-100"
                : isOther ? "border-gray-100 opacity-50 cursor-not-allowed"
                : "border-gray-200 bg-white hover:border-green-300 hover:shadow-sm cursor-pointer"
              } bg-white`}>
              <div className="flex items-center gap-3 p-4" onClick={()=>!isOther&&setExpanded(isExp?null:job._id)}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor:URGENCY_DOT[job.urgency] }}/>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{job.address}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{job.location}</p>
                </div>
                <WasteTypeBadge type={job.wasteType}/>
                {!isOther && <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExp?"rotate-90":""}`}/>}
              </div>
              <div className="flex gap-4 px-4 pb-3 -mt-1">
                <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3 h-3"/>{job.preferredTime||"Flexible"}</span>
                <span className="flex items-center gap-1 text-xs text-gray-400"><Weight className="w-3 h-3"/>{job.amount}</span>
                {job.distanceKm!=null && <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="w-3 h-3"/>{job.distanceKm.toFixed(1)} km</span>}
              </div>
              {isExp && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60 space-y-3">
                  {job.description && <p className="text-xs text-gray-600">{job.description}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={e=>{e.stopPropagation();onStart(job);}} disabled={!!activeJobId}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold transition-colors">
                      <Navigation className="w-3.5 h-3.5"/>Start Trip
                    </button>
                    {/* ★ View Map button */}
                    <button
                      onClick={e=>{e.stopPropagation(); setMapJob(job);}}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-200 bg-green-50 text-xs font-bold text-green-700 hover:bg-green-100 transition-colors">
                      <Map className="w-3.5 h-3.5"/>View Map
                    </button>
                    {job.contactPhone && (
                      <a href={`tel:${job.contactPhone}`} onClick={e=>e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                        <Phone className="w-3.5 h-3.5"/>Call
                      </a>
                    )}
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"
                      onClick={e=>e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <MapPin className="w-3.5 h-3.5"/>Google Maps
                    </a>
                  </div>
                </div>
              )}
              {isActive && (
                <div className="bg-green-600 text-white text-xs font-black text-center py-1.5 tracking-widest">
                  ● ACTIVE — IN PROGRESS
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── PANEL: Trip ──────────────────────────────────────────────────────────────
function TripPanel({ job, elapsed, checks, onToggleCheck, onArrived, onReportIssue }: {
  job:Job|null; elapsed:number; checks:boolean[];
  onToggleCheck:(i:number)=>void; onArrived:()=>void; onReportIssue:()=>void;
}) {
  const [showMap, setShowMap] = useState(false); // ★

  if (!job) return (
    <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2 p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-1">
        <Navigation className="w-7 h-7 text-gray-300"/>
      </div>
      <p className="font-bold text-gray-600">No active trip</p>
      <p className="text-sm">Select a job and tap "Start Trip".</p>
    </div>
  );

  const checkedCount = checks.filter(Boolean).length;
  const canArrive = checkedCount >= 3;

  return (
    <>
      {/* ★ Map modal from trip panel */}
      {showMap && <JobMapModal address={job.address} onClose={() => setShowMap(false)} />}

      <div className="p-4 space-y-4">
        {/* Banner */}
        <div className="rounded-2xl bg-gradient-to-br from-green-900 to-emerald-800 text-white p-5">
          <p className="text-[10px] font-black tracking-widest opacity-60 mb-1">ACTIVE JOB</p>
          <p className="font-bold text-base leading-tight mb-4">{job.address}</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"ETA",      value:job.etaMin!=null?`${job.etaMin} min`:"—" },
              { label:"Distance", value:job.distanceKm!=null?`${job.distanceKm.toFixed(1)} km`:"—" },
              { label:"Elapsed",  value:fmtTimer(elapsed) },
            ].map(({label,value})=>(
              <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                <p className="font-mono text-base font-black">{value}</p>
                <p className="text-[10px] opacity-60 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-wide
            ${job.status === "collecting"
              ? "bg-blue-100 text-blue-700"
              : "bg-amber-100 text-amber-700"
            }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current inline-block"/>
            {job.status === "collecting" ? "AT LOCATION — COLLECTING" : "EN ROUTE"}
          </span>
        </div>

        {/* ★ Navigation buttons row */}
        <div className="grid grid-cols-2 gap-2">
          <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Navigation className="w-4 h-4 text-green-600"/>Google Maps
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400"/>
          </a>
          {/* ★ In-app map button */}
          <button
            onClick={() => setShowMap(true)}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 transition-colors">
            <div className="flex items-center gap-2 text-sm font-bold text-green-700">
              <Map className="w-4 h-4 text-green-600"/>View Map
            </div>
            <ArrowRight className="w-4 h-4 text-green-400"/>
          </button>
        </div>

        {/* Checklist */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase">Pre-Arrival Checklist</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${checkedCount>=3?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>
              {checkedCount}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
          <ul className="space-y-2">
            {CHECKLIST_ITEMS.map((item,i)=>(
              <li key={i} onClick={()=>onToggleCheck(i)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-all duration-150 ${
                  checks[i] ? "border-green-200 bg-green-50":"border-gray-200 bg-white hover:border-gray-300"
                }`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  checks[i] ? "bg-green-600 border-green-600":"border-gray-300"
                }`}>
                  {checks[i] && <Check className="w-3 h-3 text-white"/>}
                </div>
                <span className={`text-sm ${checks[i]?"text-green-800 font-medium":"text-gray-700"}`}>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <button onClick={onArrived} disabled={!canArrive}
          className="w-full py-3.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 text-white shadow-sm">
          <CheckCircle2 className="w-4 h-4"/>
          {canArrive ? "Mark Arrived & Start Collection":`Complete ${3-checkedCount} more item${3-checkedCount!==1?"s":""}`}
        </button>

        <button onClick={onReportIssue}
          className="w-full py-3 rounded-xl font-bold text-sm border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4"/>Report Issue
        </button>
      </div>
    </>
  );
}

// ─── PANEL: Proof ─────────────────────────────────────────────────────────────
function ProofPanel({ job, onComplete }: {
  job:Job|null; onComplete:(data:{weight:number;notes:string;imageUrls:string[]})=>void;
}) {
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{file:File;preview:string;url?:string}[]>([]);
  const [sigCaptured, setSigCaptured] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadToS3 = async (file:File): Promise<string> => {
    const res = await fetch("/api/upload-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,fileType:file.type})});
    const {uploadUrl,publicUrl} = await res.json();
    await fetch(uploadUrl,{method:"PUT",body:file,headers:{"Content-Type":file.type}});
    return publicUrl;
  };

  const handleFileChange = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files||[]);
    if(photos.length+files.length>5){alert("Maximum 5 photos allowed");return;}
    setUploading(true);
    for(const file of files){
      const preview=URL.createObjectURL(file);
      setPhotos(prev=>[...prev,{file,preview}]);
      try{const url=await uploadToS3(file);setPhotos(prev=>prev.map(p=>p.preview===preview?{...p,url}:p));}
      catch{console.error("Upload failed for",file.name);}
    }
    setUploading(false); e.target.value="";
  };

  const handleSubmit = async () => {
    if(!weight||parseFloat(weight)<=0){alert("Please enter the weight.");return;}
    if(photos.length<1){alert("At least one photo required.");return;}
    const imageUrls=photos.map(p=>p.url).filter(Boolean) as string[];
    setSubmitting(true);
    await onComplete({weight:parseFloat(weight),notes,imageUrls});
    setSubmitting(false);
  };

  if (!job) return (
    <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2 p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-1">
        <Camera className="w-7 h-7 text-gray-300"/>
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
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handleFileChange} className="hidden"/>
        {photos.length<5 && (
          <button onClick={()=>fileRef.current?.click()} disabled={uploading}
            className="w-full border-2 border-dashed border-gray-200 hover:border-green-400 rounded-2xl py-5 flex flex-col items-center gap-2 text-gray-400 hover:text-green-600 transition-all mb-3 disabled:opacity-50 bg-gray-50/50">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin"/> : <Camera className="w-6 h-6"/>}
            <span className="text-sm font-bold">{uploading?"Uploading…":"Tap to capture photo"}</span>
            <span className="text-xs">JPG / PNG · max 10 MB each</span>
          </button>
        )}
        {photos.length>0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {photos.map(p=>(
              <div key={p.preview} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                <img src={p.preview} alt="proof" className="w-full h-full object-cover"/>
                {!p.url && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Loader2 className="w-5 h-5 text-white animate-spin"/></div>}
                {p.url && <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white"/></div>}
                <button onClick={()=>setPhotos(prev=>prev.filter(x=>x.preview!==p.preview))} className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><X className="w-3 h-3 text-white"/></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weight */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Weight Collected</p>
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-green-400/40 focus-within:border-green-400 transition-all">
          <Weight className="w-5 h-5 text-green-600 flex-shrink-0"/>
          <input type="number" min="0" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)}
            placeholder="0.0" className="flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none placeholder-gray-300 w-16"/>
          <span className="text-gray-500 font-bold">kg</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Notes for Dispatcher</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)}
          placeholder="Any issues, access problems, or extra info…" rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 resize-none placeholder-gray-400 transition-all"/>
      </div>

      {/* Signature */}
      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-2">Resident Signature</p>
        {!sigCaptured ? (
          <button onClick={()=>setSigCaptured(true)}
            className="w-full border-2 border-dashed border-gray-200 hover:border-green-400 rounded-xl py-4 text-sm text-gray-400 hover:text-green-600 transition-all flex items-center justify-center gap-2 bg-gray-50/50">
            ✍ Tap to capture resident signature
          </button>
        ) : (
          <div className="flex items-center gap-2 border border-green-300 bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0"/>
            <span className="text-sm font-bold text-green-800 flex-1">Signature captured</span>
            <button onClick={()=>setSigCaptured(false)} className="text-green-600 hover:text-green-800"><RotateCcw className="w-4 h-4"/></button>
          </div>
        )}
      </div>

      <button onClick={handleSubmit} disabled={submitting||uploading}
        className="w-full py-4 rounded-xl font-black text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 text-white transition-colors flex items-center justify-center gap-2 shadow-sm">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
        {submitting ? "Submitting…":"Submit & Complete Job"}
      </button>
    </div>
  );
}

// ─── PANEL: My Day ────────────────────────────────────────────────────────────
function DayPanel({ summary, jobs }: { summary:DaySummary; jobs:Job[] }) {
  const stats = [
    { label:"Jobs Done",   value:`${summary.completed}/${summary.total}`, Icon:CheckCircle2, color:"#10B981", bg:"#F0FDF9" },
    { label:"Kg Collected",value:`${summary.kgCollected.toFixed(1)}`,     Icon:Weight,       color:"#3B82F6", bg:"#EFF6FF" },
    { label:"Points",      value:`${summary.points}`,                     Icon:Star,         color:"#F59E0B", bg:"#FFFBEB" },
    { label:"On-Time",     value:`${summary.onTimeRate}%`,                Icon:TrendingUp,   color:"#8B5CF6", bg:"#F5F3FF" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({label,value,Icon,color,bg})=>(
          <div key={label} className="rounded-2xl border border-gray-100 p-4" style={{ backgroundColor:bg }}>
            <Icon className="w-5 h-5 mb-2" style={{ color }}/>
            <p className="text-2xl font-black text-gray-900 font-mono">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-amber-500"/>
        </div>
        <div>
          <p className="text-sm font-black text-amber-900">You're in the top 10%</p>
          <p className="text-xs text-amber-700">Keep it up to claim your weekly bonus!</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-4">Route Progress</p>
        <div className="space-y-0">
          {[
            { label:"Depot — Start of shift", time:"06:45", done:true },
            ...jobs.map(j=>({label:j.address,time:j.preferredTime||"—",done:j.status==="completed",active:j.status!=="completed"&&j.status!=="assigned"})),
            { label:"Depot — End of shift", time:"Est. 16:00", done:false },
          ].map((item,i,arr)=>(
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 z-10 ${
                  item.done ? "bg-green-600 border-green-600"
                  : (item as any).active ? "bg-amber-400 border-amber-500"
                  : "bg-white border-gray-200"
                }`}>
                  {item.done && <Check className="w-3 h-3 text-white"/>}
                </div>
                {i<arr.length-1 && <div className={`w-0.5 h-8 mt-1 ${item.done?"bg-green-200":"bg-gray-100"}`}/>}
              </div>
              <div className="pb-5">
                <p className={`text-sm font-semibold ${item.done?"text-green-800":"text-gray-700"}`}>{item.label}</p>
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
function CompletionOverlay({ onDone }: { onDone:()=>void }) {
  return (
    <div className="absolute inset-0 z-50 bg-gradient-to-br from-green-800 to-emerald-700 flex flex-col items-center justify-center gap-4 text-white text-center px-8">
      <div className="text-6xl animate-bounce">🎉</div>
      <h2 className="text-2xl font-black">Job Complete!</h2>
      <p className="text-green-200 text-sm max-w-xs leading-relaxed">Proof submitted and dispatcher notified. Points added to your total.</p>
      <button onClick={onDone}
        className="mt-2 px-8 py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 font-bold transition-colors text-sm">
        Back to Jobs
      </button>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DriverPage() {
  const { user, loading:authLoading } = useAuth();
  const router = useRouter();

  const {
    jobs, summary, loading: jobsLoading,
    activeJob, checks, elapsed, restoredTab,
    startTrip, markArrived, completeJob, reportIssue, toggleCheck, saveTab,
  } = useDriverJobs();

  const [tab, setTab] = useState("jobs");
  const [showComplete, setShowComplete] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // ★ Broadcast GPS while driver has an active job
  useLocationBroadcast({ enabled: !!activeJob });

  useEffect(()=>{ if(!authLoading&&!user) router.push("/"); },[user,authLoading,router]);

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

  const handleComplete = async (data: {weight:number;notes:string;imageUrls:string[]}) => {
    if (!activeJob) return;
    await completeJob(activeJob._id, data);
    setShowComplete(true);
  };

  const handleDone = () => {
    setShowComplete(false);
    handleSetTab("jobs");
  };

  const handleReportIssue = async () => {
    if (!activeJob) return;
    const issue = prompt("Briefly describe the issue:");
    if (!issue) return;
    await reportIssue(activeJob._id, issue);
    alert("Issue reported to dispatcher.");
  };

  if(authLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-green-600"/></div>;
  if(!user) return null;

  const parts = user.name.trim().split(/\s+/);
  const initials = parts.length>=2?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():parts[0].slice(0,2).toUpperCase();
  const completionPct = summary.total > 0 ? Math.round(summary.completed/summary.total*100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center lg:items-center lg:py-8 px-0 lg:px-4 mt-20">
      <div className="w-full lg:max-w-2xl xl:max-w-3xl relative">
        <div className="bg-white shadow-xl lg:rounded-3xl lg:border lg:border-gray-200 overflow-hidden relative min-h-screen lg:min-h-0">
          {showComplete && <CompletionOverlay onDone={handleDone}/>}

          {/* Header */}
          <div className="bg-gradient-to-r from-green-900 to-emerald-800 px-5 lg:px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center font-black text-sm flex-shrink-0 border-2 border-white/30">
                  {initials}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{user.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-green-300 text-xs font-medium">Driver</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeJob ? "bg-amber-400/20 text-amber-300":"bg-green-400/20 text-green-300"}`}>
                      {activeJob ? "● On Job":"● Ready"}
                    </span>
                    {/* ★ Location broadcasting indicator */}
                    {activeJob && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-400/20 text-blue-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse inline-block"/>
                        Sharing location
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-mono font-bold text-base">
                  {new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"})}
                </p>
                <p className="text-green-300 text-xs mt-0.5">{new Date().toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"})}</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-green-300 text-xs font-medium">Daily Progress</span>
                <span className="text-white text-xs font-bold">{summary.completed}/{summary.total} jobs</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div className="h-1.5 bg-white rounded-full transition-all duration-500" style={{ width:`${completionPct}%` }}/>
              </div>
            </div>
          </div>

          <TabBar tab={tab} setTab={handleSetTab} hasActiveJob={!!activeJob}/>

          {showResumeBanner && activeJob && (
            <ResumeBanner job={activeJob as any} onDismiss={()=>setShowResumeBanner(false)}/>
          )}

          <div className="overflow-y-auto" style={{ maxHeight:"calc(100vh - 200px)" }}>
            {tab==="jobs"  && <JobsPanel  jobs={jobs as any[]}   loading={jobsLoading} activeJobId={activeJob?._id??null} onStart={handleStartTrip}/>}
            {tab==="trip"  && <TripPanel  job={activeJob as any} elapsed={elapsed} checks={checks} onToggleCheck={toggleCheck} onArrived={handleArrived} onReportIssue={handleReportIssue}/>}
            {tab==="proof" && <ProofPanel job={activeJob as any} onComplete={handleComplete}/>}
            {tab==="day"   && <DayPanel   summary={summary as any} jobs={jobs as any[]}/>}
          </div>
        </div>
      </div>
    </div>
  );
}