'use client'
import { useState, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Leaf, MapPin, Trash2, Camera, Upload, X, CheckCircle,
  Clock, AlertTriangle, Phone, Calendar, ChevronDown,
  ArrowRight, Loader2, FileImage, Package
} from 'lucide-react'
import { toast } from 'react-hot-toast'

// ─── Types ───────────────────────────────────────────────────────────────────
type Urgency = 'low' | 'normal' | 'high'
type WasteType = 'Household' | 'Recyclable' | 'Waste picker' | 'School' | 'Electronic' | 'Company' | 'Food/Garden' | 'Medical/Hazardous'

interface UploadedImage {
  file: File
  preview: string
  publicUrl?: string
  uploading: boolean
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WASTE_TYPES: { value: WasteType; label: string; icon: string; color: string }[] = [
  { value: 'Household',        label: 'Household Waste',    icon: '🗑️',  color: '#6b7280' },
  { value: 'Recyclable',     label: 'Recyclable',       icon: '♻️',  color: '#16a34a' },
  { value: 'Waste picker',        label: 'Waste Picker',   icon: '🌿',  color: '#65a30d' },
  { value: 'School',      label: 'School Waste',        icon: '⚠️',  color: '#dc2626' },
  { value: 'Electronic',     label: 'E-Waste',          icon: '💻',  color: '#7c3aed' },
  { value: 'Company', label: 'Company Waste', icon: '🛋️',  color: '#92400e' },
  { value: 'Food/Garden',         label: 'Food/Garden Waste',     icon: '🌳',  color: '#15803d' },
  { value: 'Medical/Hazardous',        label: 'Medical/Hazardous Waste',    icon: '🏥',  color: '#0891b2' },
]

const URGENCY_OPTIONS: { value: Urgency; label: string; desc: string; color: string }[] = [
  { value: 'low',    label: 'Low',    desc: 'Within 2 weeks',  color: '#16a34a' },
  { value: 'normal', label: 'Normal', desc: 'Within 3–5 days', color: '#d97706' },
  { value: 'high',   label: 'Urgent', desc: 'Within 24 hours', color: '#dc2626' },
]

// ─── Image upload helper ──────────────────────────────────────────────────────
async function uploadToS3(file: File): Promise<string> {
  // 1. Get presigned URL from our API
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type }),
  })
  if (!res.ok) throw new Error('Failed to get upload URL')
  const { uploadUrl, publicUrl } = await res.json()

  // 2. PUT directly to S3
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!uploadRes.ok) throw new Error('Failed to upload to S3')

  return publicUrl
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RequestCollectionPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [wasteType, setWasteType]       = useState<WasteType | ''>('')
  const [amount, setAmount]             = useState('')
  const [location, setLocation]         = useState('')
  const [address, setAddress]           = useState('')
  const [description, setDescription]  = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [urgency, setUrgency]           = useState<Urgency>('normal')
  const [contactPhone, setContactPhone] = useState('')
  const [images, setImages]             = useState<UploadedImage[]>([])
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [requestId, setRequestId]       = useState('')

  // ── Image handlers ─────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((files: FileList | null) => {
    if (!files) return
    const newImages: UploadedImage[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 5 - images.length)
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
      }))
    setImages(prev => [...prev, ...newImages])
  }, [images.length])

  const removeImage = (idx: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const uploadAllImages = async (): Promise<string[]> => {
    const urls: string[] = []
    for (let i = 0; i < images.length; i++) {
      if (images[i].publicUrl) {
        urls.push(images[i].publicUrl!)
        continue
      }
      setImages(prev => prev.map((img, idx) => idx === i ? { ...img, uploading: true } : img))
      try {
        const url = await uploadToS3(images[i].file)
        urls.push(url)
        setImages(prev => prev.map((img, idx) => idx === i ? { ...img, uploading: false, publicUrl: url } : img))
      } catch {
        setImages(prev => prev.map((img, idx) => idx === i ? { ...img, uploading: false, error: 'Upload failed' } : img))
        throw new Error(`Failed to upload image ${i + 1}`)
      }
    }
    return urls
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { toast.error('Please sign in to submit a request'); return }
    if (!wasteType) { toast.error('Please select a waste type'); return }
    if (!location)  { toast.error('Please enter your area / suburb'); return }
    if (!address)   { toast.error('Please enter your full address'); return }

    setSubmitting(true)
    try {
      // Upload images first
      let imageUrls: string[] = []
      if (images.length > 0) {
        toast.loading('Uploading photos…', { id: 'upload' })
        imageUrls = await uploadAllImages()
        toast.dismiss('upload')
      }

      // Submit request
      const res = await fetch('/api/waste-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wasteType, amount, location, address, description,
          preferredDate, preferredTime, urgency, contactPhone, imageUrls,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')

      setRequestId(data.requestId)
      setSubmitted(true)
      toast.success('Request submitted!')
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 60%, #f0fdf4 100%)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 mb-4 text-sm">
            Your waste collection request has been received. A collector will be assigned shortly.
          </p>
          <div className="bg-green-50 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-xs text-gray-500 mb-1">Request ID</p>
            <p className="text-sm font-mono font-semibold text-green-700 break-all">{requestId}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setSubmitted(false); setWasteType(''); setAddress(''); setLocation(''); setImages([]); setDescription(''); setAmount(''); }}
              className="flex-1 py-3 rounded-xl border-2 border-green-200 text-green-700 font-semibold text-sm hover:bg-green-50 transition"
            >
              New Request
            </button>
            {/*<button
              onClick={() => router.push('/collect')}
              className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
            >
              View Tasks <ArrowRight className="h-4 w-4" />
            </button>*/}
          </div>
        </div>
      </div>
    )
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' }}>
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
          <Leaf className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Sign in required</h2>
          <p className="text-gray-500 text-sm mb-6">Please sign in to request a waste collection.</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-16 mt-20" style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #ffffff 50%, #f7fee7 100%)' }}>
      {/* Page header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative px-6 py-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-white/20 rounded-xl p-2">
              <Trash2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-green-200 text-sm font-medium tracking-wide uppercase">Community Service</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Request Waste Collection
          </h1>
          <p className="text-green-100 text-sm md:text-base max-w-xl">
            Submit a pickup request and a verified collector in your area will be assigned. Upload photos to help us assess the waste accurately.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 md:px-6 mt-8 space-y-6">

        {/* ── Waste Type ── */}
        <Section title="What type of waste?" icon={<Trash2 className="h-4 w-4" />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {WASTE_TYPES.map(wt => (
              <button
                key={wt.value}
                type="button"
                onClick={() => setWasteType(wt.value)}
                className="relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 text-center"
                style={{
                  borderColor: wasteType === wt.value ? wt.color : '#e5e7eb',
                  background: wasteType === wt.value ? `${wt.color}15` : 'white',
                  boxShadow: wasteType === wt.value ? `0 0 0 1px ${wt.color}` : 'none',
                }}
              >
                <span className="text-2xl">{wt.icon}</span>
                <span className="text-xs font-semibold text-gray-700 leading-tight">{wt.label}</span>
                {wasteType === wt.value && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: wt.color }} />
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Location ── */}
        <Section title="Pickup Location" icon={<MapPin className="h-4 w-4" />}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Area / Suburb *</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Hatfield, Pretoria"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Street Address *</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. 12 Roper Street, Hatfield, 0083"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 placeholder-gray-400"
              />
            </div>
          </div>
        </Section>

        {/* ── Waste Details ── */}
        <Section title="Waste Details" icon={<Package className="h-4 w-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Estimated Amount</label>
              <input
                type="text"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 3 bags, 50kg, 1 mattress"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="+27 82 000 0000"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 placeholder-gray-400"
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Additional Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the waste, access instructions, or any special notes…"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 placeholder-gray-400 resize-none"
            />
          </div>
        </Section>

        {/* ── Schedule ── */}
        <Section title="Preferred Schedule" icon={<Calendar className="h-4 w-4" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Preferred Date</label>
              <input
                type="date"
                value={preferredDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setPreferredDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Preferred Time</label>
              <select
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm text-gray-800 appearance-none"
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
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Urgency Level</label>
            <div className="flex gap-3">
              {URGENCY_OPTIONS.map(u => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUrgency(u.value)}
                  className="flex-1 py-3 px-2 rounded-xl border-2 transition-all duration-200 text-center"
                  style={{
                    borderColor: urgency === u.value ? u.color : '#e5e7eb',
                    background: urgency === u.value ? `${u.color}12` : 'white',
                  }}
                >
                  <div className="text-xs font-bold mb-0.5" style={{ color: u.color }}>{u.label}</div>
                  <div className="text-[10px] text-gray-500">{u.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Photo Upload ── */}
        <Section title="Upload Photos" icon={<Camera className="h-4 w-4" />}>
          <p className="text-xs text-gray-500 mb-3">
            Add up to 5 photos of the waste. This helps collectors prepare and speeds up verification.
          </p>

          {/* Drop zone */}
          {images.length < 5 && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileDrop(e.dataTransfer.files) }}
              className="border-2 border-dashed border-green-200 rounded-2xl p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-all duration-200 mb-4"
            >
              <FileImage className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Drop photos here or <span className="text-green-600">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB each · {5 - images.length} remaining</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFileDrop(e.target.files)}
              />
            </div>
          )}

          {/* Preview grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  {img.uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  )}
                  {img.publicUrl && !img.uploading && (
                    <div className="absolute bottom-1 right-1 bg-green-500 rounded-full p-0.5">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {img.error && (
                    <div className="absolute inset-0 bg-red-500/70 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 left-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Submit ── */}
        <div className="sticky bottom-4">
          <button
            type="submit"
            disabled={submitting || !wasteType || !location || !address}
            className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
            style={{
              background: submitting || !wasteType || !location || !address
                ? '#86efac'
                : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              boxShadow: submitting ? 'none' : '0 8px 25px rgba(22,163,74,0.4)',
            }}
          >
            {submitting
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</>
              : <><Upload className="h-5 w-5" /> Submit Collection Request</>
            }
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            Your request will appear in the collector task board immediately.
          </p>
        </div>
      </form>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50"
        style={{ background: 'linear-gradient(90deg, #f0fdf4, #ffffff)' }}>
        <span className="text-green-600">{icon}</span>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}