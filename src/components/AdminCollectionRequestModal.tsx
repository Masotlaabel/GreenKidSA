// Path: /components/AdminCollectionRequestModal.tsx
"use client";
import { useState, useCallback, useRef } from "react";
import {
  X, Trash2, Camera, Upload, CheckCircle, Clock,
  AlertTriangle, Phone, Calendar, Loader2, FileImage, Package,
  User, Plus, MapPin,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AddressAutocomplete, MapboxFeature } from "@/components/AddressAutocomplete";

// ─── Types ────────────────────────────────────────────────────────────────────
type Urgency = "low" | "normal" | "high";
type WasteType =
  | "General" | "Recyclable" | "Organic" | "Hazardous"
  | "Electronic" | "Bulk/Furniture" | "Garden" | "Medical";

interface Driver {
  _id: string;
  name: string;
  status: "active" | "idle" | "offline";
}

interface AdminCollectionRequestModalProps {
  open: boolean;
  onClose: () => void;
  drivers: Driver[];
  onCreated?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WASTE_TYPES: { value: WasteType; label: string; icon: string; color: string }[] = [
  { value: "General",        label: "General Waste",    icon: "🗑️", color: "#6b7280" },
  { value: "Recyclable",     label: "Recyclable",       icon: "♻️", color: "#16a34a" },
  { value: "Organic",        label: "Organic / Food",   icon: "🌿", color: "#65a30d" },
  { value: "Hazardous",      label: "Hazardous",        icon: "⚠️", color: "#dc2626" },
  { value: "Electronic",     label: "E-Waste",          icon: "💻", color: "#7c3aed" },
  { value: "Bulk/Furniture", label: "Bulk / Furniture", icon: "🛋️", color: "#92400e" },
  { value: "Garden",         label: "Garden Waste",     icon: "🌳", color: "#15803d" },
  { value: "Medical",        label: "Medical Waste",    icon: "🏥", color: "#0891b2" },
];

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string; color: string }[] = [
  { value: "low",    label: "Low",    desc: "Within 2 weeks",  color: "#16a34a" },
  { value: "normal", label: "Normal", desc: "Within 3–5 days", color: "#d97706" },
  { value: "high",   label: "Urgent", desc: "Within 24 hours", color: "#dc2626" },
];

// ─── Upload helper ────────────────────────────────────────────────────────────
async function uploadToS3(file: File): Promise<string> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileType: file.type }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, publicUrl } = await res.json();
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Failed to upload to S3");
  return publicUrl;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50/60 rounded-xl border border-gray-100 overflow-visible">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white rounded-t-xl">
        <span className="text-green-600">{icon}</span>
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export function AdminCollectionRequestModal({
  open, onClose, drivers, onCreated,
}: AdminCollectionRequestModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [residentName,  setResidentName]  = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [wasteType,     setWasteType]     = useState<WasteType | "">("");
  const [amount,        setAmount]        = useState("");
  const [location,      setLocation]      = useState("");
  const [address,       setAddress]       = useState("");
  const [description,   setDescription]  = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [urgency,       setUrgency]       = useState<Urgency>("normal");
  const [contactPhone,  setContactPhone]  = useState("");
  const [assignTo,      setAssignTo]      = useState("");
  const [images,        setImages]        = useState<{
    file: File; preview: string; url?: string; uploading: boolean;
  }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState<string | null>(null);

  // Reset all state
  const reset = () => {
    setResidentName(""); setResidentEmail(""); setWasteType(""); setAmount("");
    setLocation(""); setAddress(""); setDescription(""); setPreferredDate("");
    setPreferredTime(""); setUrgency("normal"); setContactPhone("");
    setAssignTo(""); setImages([]); setSubmitting(false); setDone(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Image handling ──────────────────────────────────────────────────────────
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const toAdd = Array.from(files)
      .filter(f => f.type.startsWith("image/"))
      .slice(0, 5 - images.length)
      .map(file => ({ file, preview: URL.createObjectURL(file), uploading: false }));
    setImages(prev => [...prev, ...toAdd]);
  }, [images.length]);

  const removeImage = (idx: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploadAll = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      if (images[i].url) { urls.push(images[i].url!); continue; }
      setImages(prev => prev.map((img, j) => j === i ? { ...img, uploading: true } : img));
      try {
        const url = await uploadToS3(images[i].file);
        urls.push(url);
        setImages(prev => prev.map((img, j) => j === i ? { ...img, uploading: false, url } : img));
      } catch {
        setImages(prev => prev.map((img, j) => j === i ? { ...img, uploading: false } : img));
        throw new Error(`Failed to upload image ${i + 1}`);
      }
    }
    return urls;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!wasteType) { toast.error("Please select a waste type"); return; }
    if (!location)  { toast.error("Please enter the suburb / area"); return; }
    if (!address)   { toast.error("Please enter the full street address"); return; }

    setSubmitting(true);
    try {
      // Upload images if any
      let imageUrls: string[] = [];
      if (images.length > 0) {
        toast.loading("Uploading photos…", { id: "admin-upload" });
        imageUrls = await uploadAll();
        toast.dismiss("admin-upload");
      }

      // ── Create the waste request ──────────────────────────────────────────
      // We post directly to /api/waste-requests.
      // The overrideUserName / overrideUserEmail fields are picked up by the
      // POST handler in /api/waste-requests/route.ts so the request is saved
      // under the resident's name instead of the admin's.
      const createRes = await fetch("/api/waste-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wasteType,
          amount:        amount || "Unknown",
          location,
          address,
          description,
          preferredDate: preferredDate || null,
          preferredTime: preferredTime || null,
          urgency,
          contactPhone,
          imageUrls,
          overrideUserName:  residentName.trim()  || undefined,
          overrideUserEmail: residentEmail.trim() || undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create request");
      }

      const requestId: string = createData.requestId;

      // ── Optionally assign driver immediately ──────────────────────────────
      if (assignTo && requestId) {
        const driver = drivers.find(d => d._id === assignTo);
        if (driver) {
          const assignRes = await fetch("/api/admin/assign", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              driverId:   assignTo,
              driverName: driver.name,
            }),
          });
          if (!assignRes.ok) {
            // Request was created — just warn, don't throw
            toast.error("Request created but driver assignment failed. Assign manually.");
          }
        }
      }

      toast.success("Request created successfully!");
      setDone(requestId);
      onCreated?.();     // refresh the parent's data
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <Backdrop onClose={handleClose}>
        <div className="text-center py-6 px-2">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-1">Request Created!</h2>
          <p className="text-sm text-gray-500 mb-4">
            {assignTo
              ? `Job assigned to ${drivers.find(d => d._id === assignTo)?.name ?? "driver"}.`
              : "A driver can be assigned from the Requests tab."}
          </p>
          <div className="bg-green-50 rounded-xl px-4 py-3 mb-5 text-left">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Request ID</p>
            <p className="text-xs font-mono text-green-700 break-all">{done}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => reset()}
              className="flex-1 py-2.5 rounded-xl border-2 border-green-200 text-green-700 text-sm font-bold hover:bg-green-50 transition-colors">
              New Request
            </button>
            <button onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors">
              Close
            </button>
          </div>
        </div>
      </Backdrop>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <Backdrop onClose={handleClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
            <Plus className="w-4 h-4 text-green-700" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-base leading-tight">New Collection Request</h2>
            <p className="text-xs text-gray-400">Created by admin on behalf of resident</p>
          </div>
        </div>
        <button onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Resident Info ── */}
        <Section title="Resident Details" icon={<User className="w-4 h-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Full Name
              </label>
              <input
                type="text" value={residentName} onChange={e => setResidentName(e.target.value)}
                placeholder="e.g. Jane Dlamini"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Email Address
              </label>
              <input
                type="email" value={residentEmail} onChange={e => setResidentEmail(e.target.value)}
                placeholder="resident@email.com"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
              />
            </div>
          </div>
        </Section>

        {/* ── Waste Type ── */}
        <Section title="Waste Type" icon={<Trash2 className="w-4 h-4" />}>
          <div className="grid grid-cols-4 gap-2">
            {WASTE_TYPES.map(wt => (
              <button key={wt.value} type="button" onClick={() => setWasteType(wt.value)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all duration-150 text-center relative"
                style={{
                  borderColor: wasteType === wt.value ? wt.color : "#e5e7eb",
                  background:  wasteType === wt.value ? `${wt.color}12` : "white",
                }}>
                <span className="text-xl">{wt.icon}</span>
                <span className="text-[10px] font-bold text-gray-600 leading-tight">{wt.label}</span>
                {wasteType === wt.value && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wt.color }} />
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Pickup Location — with Mapbox autocomplete ── */}
        <Section title="Pickup Location" icon={<MapPin className="w-4 h-4" />}>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Area / Suburb *
              </label>
              <input
                type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Hatfield, Pretoria" required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Full Street Address *
              </label>
              {/* Shared Mapbox autocomplete — same as resident request form */}
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="e.g. 12 Roper Street, Hatfield, 0083"
                required
                onSelect={(feature: MapboxFeature) => {
                  // Auto-fill suburb from Mapbox context when available
                  const suburb =
                    feature.context?.find(
                      c =>
                        c.id.startsWith("locality") ||
                        c.id.startsWith("neighborhood") ||
                        c.id.startsWith("place")
                    )?.text ?? "";
                  if (suburb && !location) setLocation(suburb);
                }}
              />
            </div>
          </div>
        </Section>

        {/* ── Waste Details ── */}
        <Section title="Waste Details" icon={<Package className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Estimated Amount
              </label>
              <input
                type="text" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 3 bags, 50kg"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Contact Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  placeholder="+27 82 000 0000"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              Notes
            </label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Access instructions, special notes…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all resize-none"
            />
          </div>
        </Section>

        {/* ── Schedule & Urgency ── */}
        <Section title="Schedule & Urgency" icon={<Calendar className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Preferred Date
              </label>
              <input
                type="date" value={preferredDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={e => setPreferredDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Preferred Time
              </label>
              <select
                value={preferredTime} onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all appearance-none"
              >
                <option value="">Any time</option>
                <option value="07:00–10:00">Morning (07:00–10:00)</option>
                <option value="10:00–13:00">Late Morning (10:00–13:00)</option>
                <option value="13:00–16:00">Afternoon (13:00–16:00)</option>
                <option value="16:00–18:00">Late Afternoon (16:00–18:00)</option>
              </select>
            </div>
          </div>
          {/* Urgency */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Urgency
            </label>
            <div className="flex gap-2">
              {URGENCY_OPTIONS.map(u => (
                <button key={u.value} type="button" onClick={() => setUrgency(u.value)}
                  className="flex-1 py-2.5 px-2 rounded-xl border-2 transition-all duration-150 text-center"
                  style={{
                    borderColor: urgency === u.value ? u.color : "#e5e7eb",
                    background:  urgency === u.value ? `${u.color}10` : "white",
                  }}>
                  <div className="text-xs font-black mb-0.5" style={{ color: u.color }}>{u.label}</div>
                  <div className="text-[10px] text-gray-400">{u.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Assign Driver (optional) ── */}
        <Section title="Assign Driver (Optional)" icon={<User className="w-4 h-4" />}>
          <p className="text-xs text-gray-400 mb-3">
            Leave unset to assign later from the Requests tab.
          </p>
          <select
            value={assignTo} onChange={e => setAssignTo(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all appearance-none"
          >
            <option value="">No driver yet</option>
            {(["active", "idle", "offline"] as const).map(s => {
              const group = drivers.filter(d => d.status === s);
              if (!group.length) return null;
              const labels = { active: "● Online", idle: "◑ Idle", offline: "○ Offline" };
              return (
                <optgroup key={s} label={labels[s]}>
                  {group.map(d => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {assignTo && (
            <div className="mt-2 flex items-center gap-2 text-xs text-green-700 font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              Will be assigned immediately upon creation
            </div>
          )}
        </Section>

        {/* ── Photos ── */}
        <Section title="Photos (Optional)" icon={<Camera className="w-4 h-4" />}>
          {images.length < 5 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="border-2 border-dashed border-green-200 hover:border-green-400 rounded-xl p-6 text-center cursor-pointer transition-all hover:bg-green-50/50 mb-3"
            >
              <FileImage className="w-7 h-7 text-green-400 mx-auto mb-1.5" />
              <p className="text-sm font-semibold text-gray-600">
                Drop photos or <span className="text-green-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {5 - images.length} remaining · 10 MB max each
              </p>
              <input
                ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  {img.uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                  {img.url && !img.uploading && (
                    <div className="absolute bottom-1 right-1 bg-green-500 rounded-full p-0.5">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <button type="button" onClick={() => removeImage(idx)}
                    className="absolute top-1 left-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={submitting || !wasteType || !location || !address}
          className="w-full py-3.5 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            boxShadow: (!submitting && wasteType && location && address)
              ? "0 6px 20px rgba(22,163,74,0.35)" : "none",
          }}
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" />Creating Request…</>
            : <><Upload className="w-4 h-4" />Create Collection Request</>}
        </button>

      </form>
    </Backdrop>
  );
}

// ─── Backdrop / slide-over ────────────────────────────────────────────────────
function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex-1 p-5 lg:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}