// @ts-nocheck
'use client'
import Link from "next/link"
import { usePathname } from 'next/navigation'
import { MapPin, Trash, Coins, Medal, Settings, Home, Truck, ShieldCheck, Leaf, X, ClipboardList } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import Image from "next/image"

const PUBLIC_ITEMS = [
  { href: "/",                   icon: Home,       label: "Home" },
  { href: "/request-collection", icon: MapPin,     label: "Report Waste" },
  //{ href: "/collect",            icon: Trash,      label: "Collect Waste" },
  //{ href: "/rewards",            icon: Coins,      label: "Rewards" },
  { href: "/leaderboard",        icon: Medal,      label: "Leaderboard" },
  { href: "/my-requests", icon: ClipboardList, label: "My Requests" },
  { href: "/about",              icon: Leaf,       label: "About Us" },
  { href: "/services",           icon: Settings,   label: "Services" },
]

const DRIVER_ITEMS = [
  { href: "/driver", icon: Truck,       label: "Driver Dashboard" },
]

const ADMIN_ITEMS = [
  { href: "/admin",  icon: ShieldCheck, label: "Admin Panel" },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const role = (user as any)?.role

  const extraItems = [
    ...(role === "driver" || role === "admin" ? DRIVER_ITEMS : []),
    ...(role === "admin"  || role === "dispatcher" ? ADMIN_ITEMS : []),
  ]

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        className={`
          fixed inset-0 z-40 bg-black/25 backdrop-blur-sm
          transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
      />

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-64 flex flex-col
          bg-white/90 backdrop-blur-xl border-r border-gray-100/80
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ boxShadow: '8px 0 32px rgba(0,0,0,0.08)' }}
      >
        {/* Header row inside sidebar */}
        <div className="h-[74px] flex items-center justify-between px-5 border-b border-gray-100/80 flex-shrink-0">
          <div className="flex items-center">
            <div className="flex items-center justify-center shadow-sm">
              <Image
                  src="/logo.png"
                  alt="GreenKidSA Logo"
                  width={72}
                  height={72}
                  className="object-contain shrink-0"
                />
            </div>
            <span className="font-semibold text-gray-800 tracking-tight text-md">GreenKidSA</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            Navigation
          </p>

          {PUBLIC_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname === item.href}
              onClick={onClose}
            />
          ))}

          {extraItems.length > 0 && (
            <>
              <div className="pt-5 pb-2">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {role === "driver" ? "Driver" : "Admin"}
                </p>
              </div>
              {extraItems.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={pathname === item.href}
                  onClick={onClose}
                />
              ))}
            </>
          )}
        </nav>

        {/* Settings pinned at bottom */}
        <div className="px-3 py-4 border-t border-gray-100/80 flex-shrink-0">
          <NavItem
            href="/settings"
            icon={Settings}
            label="Settings"
            active={pathname === "/settings"}
            onClick={onClose}
          />
        </div>
      </aside>
    </>
  )
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string
  icon: any
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Link href={href} onClick={onClick}>
      <div
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
          transition-all duration-200 cursor-pointer group
          ${active
            ? 'bg-green-600 text-white shadow-sm shadow-green-200'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
          }
        `}
      >
        <Icon
          className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
            active ? 'text-white' : 'text-gray-400 group-hover:text-green-600'
          }`}
        />
        <span>{label}</span>
        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />}
      </div>
    </Link>
  )
}