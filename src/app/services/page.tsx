// @ts-nocheck
'use client'
import {
  Recycle, Truck, Building2, Package, GraduationCap, Leaf,
  ArrowRight, CheckCircle2, ChevronRight, Banknote, Phone,
  Smartphone, Scale, ShoppingBag, Wallet, FileText, Users
} from 'lucide-react'
import Link from 'next/link'
import { Poppins } from 'next/font/google'
import { useState } from 'react'

const poppins = Poppins({
  weight: ['300', '400', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
})

const SERVICES = [
  {
    id: 'onsite',
    icon: Building2,
    title: 'Onsite Waste Management',
    short: 'Dedicated waste management teams deployed directly at your facility.',
    desc: 'We place trained waste management professionals onsite at commercial, industrial, and municipal facilities to ensure consistent, compliant, and efficient waste handling from source to disposal — minimising risk and maximising accountability.',
    features: ['Dedicated site team', 'Daily reporting & logs', 'Compliance documentation', 'Waste stream segregation'],
    audience: 'Commercial · Industrial · Municipal',
  },
  {
    id: 'recycling',
    icon: Recycle,
    title: 'Recycling & Waste Minimisation',
    short: 'Community and commercial recycling programmes powered by the BanQu rewards system.',
    desc: 'Our flagship recycling programme turns waste into income. Community members sort recyclable packaging — plastic, paper, metal cans, and glass — and exchange them at designated collection sites for instant payment loaded directly onto their BanQu wallet, spendable at major South African retailers.',
    features: ['BanQu digital payments', 'SMS receipt confirmation', 'Plastics, paper, metal & glass', 'Bulk bag collection system'],
    audience: 'Residential · Community Groups',
    featured: true,
  },
  {
    id: 'landfill',
    icon: Leaf,
    title: 'Landfill Rehabilitation',
    short: 'Restoring degraded landfill sites to safe, compliant, and productive land.',
    desc: 'We provide specialised landfill rehabilitation services that address legacy contamination, illegal dumping sites, and closed landfills — working to restore land to a safe, environmentally stable condition in compliance with DEA and municipal requirements.',
    features: ['Site assessment & planning', 'Contamination remediation', 'Vegetation & capping works', 'Compliance sign-off support'],
    audience: 'Municipalities · Government',
  },
  {
    id: 'collection',
    icon: Truck,
    title: 'Waste Collection Service',
    short: 'Scheduled door-to-door collection for residential, commercial, and retail clients.',
    desc: 'Reliable, geo-tracked waste collection covering residential neighbourhoods, retail parks, and commercial premises. Our GreenKidSA platform lets clients report missed collections, track trucks in real time, and access digital collection records.',
    features: ['Residential door-to-door', 'Commercial & retail contracts', 'Real-time GPS tracking', 'Digital collection records'],
    audience: 'Residential · Commercial · Retail',
  },
  {
    id: 'skipbins',
    icon: Package,
    title: 'Skip Bin Rental & Servicing',
    short: 'Short- and long-term skip bin hire for construction, renovation, and bulk waste.',
    desc: 'We supply, deliver, collect, and service skip bins of various sizes for building sites, renovation projects, event clean-ups, and commercial bulk waste. Flexible hire periods and prompt turnaround keep your project on schedule.',
    features: ['Multiple bin sizes available', 'Flexible hire periods', 'Prompt delivery & collection', 'Responsible waste disposal'],
    audience: 'Construction · Events · Commercial',
  },
  {
    id: 'training',
    icon: GraduationCap,
    title: 'Environmental Management Training',
    short: 'Accredited skills training in waste and environmental management.',
    desc: "We deliver practical environmental management skills training to individuals, community members, and corporate teams — building South Africa's capacity to handle waste responsibly and sustainably at every level.",
    features: ['Waste sorting & handling', 'Environmental compliance', 'Community facilitator training', 'Corporate team workshops'],
    audience: 'Individuals · Corporates · Communities',
  },
]

const RECYCLING_STEPS = [
  {
    step: '01',
    title: 'Sort at Source',
    icon: Package,
    desc: 'Community members collect and separate recyclable packaging — plastic, paper, metal cans, and glass — at home using dedicated bags and bins.',
  },
  {
    step: '02',
    title: 'Collection Day Arrives',
    icon: Truck,
    desc: 'On the allocated day, the GreenKidSA truck and trailer arrives in the community at its designated collection site.',
  },
  {
    step: '03',
    title: 'Weigh & Load',
    icon: Scale,
    desc: 'Individuals bring their separated materials, which are checked, weighed, and loaded into bulk bags by our team.',
  },
  {
    step: '04',
    title: 'Earn Instant Payment',
    icon: Wallet,
    desc: "Payment is calculated per the GreenKidSA price list and loaded onto the individual's BanQu account or e-wallet immediately. An SMS receipt is sent to confirm the transaction and amount earned.",
  },
  {
    step: '05',
    title: 'Spend Anywhere',
    icon: ShoppingBag,
    desc: 'Funds are immediately available at participating merchants including Shoprite, Checkers, uSave, Pick \'n Pay, Clicks, and Dischem — or withdraw cash, buy airtime, or transfer to anyone in South Africa.',
  },
  {
    step: '06',
    title: 'Get Proof of Income',
    icon: FileText,
    desc: 'Proof of income earned is available as a payslip at an additional cost — useful for grant applications, credit, or formal employment records.',
  },
]

const COMMERCIAL_AIMS = [
  'Reduced costs through landfill avoidance and alternative disposal solutions',
  'Representation and promotion of recycling in business operations',
  'Creating a change in perception and raising awareness of the importance of recycling',
  'Maintaining good corporate citizenship and ESG compliance',
  'Providing a recycling solution and serving as a trusted information source for businesses',
  'Raising awareness of environmental issues including toner and e-waste pollution',
]

export default function ServicesPage() {
  const [activeService, setActiveService] = useState('recycling')
  const active = SERVICES.find(s => s.id === activeService)

  return (
    <div className={`${poppins.className} bg-[#f0f4f1]`}>
      <style>{`
        @keyframes blurIn {
          from { opacity: 0; filter: blur(10px); transform: translateY(12px); }
          to   { opacity: 1; filter: blur(0);   transform: translateY(0); }
        }
        .blur-in { animation: blurIn 0.8s cubic-bezier(0.16,1,0.3,1) both; }
        .section-line {
          background: linear-gradient(90deg, transparent, #86efac, transparent);
          height: 1px;
        }
        .step-connector {
          background: linear-gradient(180deg, #4ade80, transparent);
          width: 2px;
        }
      `}</style>

      {/* ── PAGE HERO ── */}
      <section className="relative overflow-hidden bg-[#052e16] pt-32 pb-24 px-6">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(ellipse at 80% 50%, #16a34a 0%, transparent 60%)' }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-green-800/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/2" />

        <div className="max-w-6xl mx-auto relative z-10">
          <span className="blur-in inline-block text-xs uppercase tracking-[0.35em] text-green-400 mb-5 font-medium" style={{ animationDelay: '0.1s' }}>
            What We Do
          </span>
          <h1 className="blur-in text-5xl md:text-6xl lg:text-7xl font-semibold text-white leading-[1.05] mb-8 max-w-3xl" style={{ animationDelay: '0.25s' }}>
            Our Services &amp;<br />
            <span className="text-green-400">How We Deliver</span>
          </h1>
          <p className="blur-in text-green-200/70 text-lg font-light leading-relaxed max-w-2xl" style={{ animationDelay: '0.4s' }}>
            From onsite waste management to community recycling incentives — GreenKidSA delivers comprehensive environmental solutions across the Free State and beyond.
          </p>
        </div>
      </section>

      {/* ── SERVICE EXPLORER ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <span className="inline-block text-xs uppercase tracking-[0.3em] text-green-600 mb-4 font-medium">Our Services</span>
          <h2 className="text-3xl md:text-4xl font-semibold text-green-900">Six Ways We Serve</h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Service list */}
          <div className="flex flex-col gap-3">
            {SERVICES.map(({ id, icon: Icon, title, short, featured }) => (
              <button
                key={id}
                onClick={() => setActiveService(id)}
                className={`text-left flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                  activeService === id
                    ? 'bg-green-900 border-green-700 shadow-lg shadow-green-900/20'
                    : 'bg-white border-green-100 hover:border-green-300 hover:shadow-md'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${activeService === id ? 'bg-green-700/60' : 'bg-green-100'}`}>
                  <Icon className={`w-5 h-5 ${activeService === id ? 'text-green-300' : 'text-green-700'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold text-sm ${activeService === id ? 'text-white' : 'text-green-900'}`}>{title}</p>
                    {featured && <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-medium flex-shrink-0">Flagship</span>}
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed font-light line-clamp-2 ${activeService === id ? 'text-green-300/70' : 'text-green-600/70'}`}>{short}</p>
                </div>
                <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${activeService === id ? 'text-green-400' : 'text-green-400'}`} />
              </button>
            ))}
          </div>

          {/* Service detail */}
          {active && (
            <div className="lg:col-span-2 bg-white border border-green-100 rounded-3xl p-8 md:p-10 flex flex-col gap-7">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <active.icon className="w-7 h-7 text-green-700" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-green-500 font-semibold mb-1">{active.audience}</p>
                  <h3 className="text-2xl font-semibold text-green-900">{active.title}</h3>
                </div>
              </div>

              <div className="section-line" />

              <p className="text-green-800/70 leading-relaxed font-light">{active.desc}</p>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-green-600 font-semibold mb-4">What's Included</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {active.features.map(f => (
                    <div key={f} className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-800 font-medium">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-4 flex flex-col sm:flex-row gap-3">
                <a href="mailto:info@greenkidsa.co.za" className="group inline-flex items-center gap-2 bg-green-900 text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-green-800 transition-colors">
                  Enquire About This Service
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>
                <a href="tel:0515073592" className="inline-flex items-center gap-2 border border-green-200 text-green-800 px-6 py-3 rounded-full text-sm font-medium hover:bg-green-50 transition-colors">
                  <Phone className="w-4 h-4" /> 051 507 3592
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="section-line max-w-6xl mx-auto px-6" />

      {/* ── RECYCLING PROCESS ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="inline-block text-xs uppercase tracking-[0.3em] text-green-600 mb-4 font-medium">Recycling Made Easy</span>
          <h2 className="text-3xl md:text-4xl font-semibold text-green-900 mb-4">How the Process Works</h2>
          <p className="text-green-700/60 font-light max-w-lg mx-auto leading-relaxed">
            Our community recycling model is simple by design — sort, drop off, get paid. Here's the full journey from your home to your wallet.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {RECYCLING_STEPS.map(({ step, title, icon: Icon, desc }, i) => (
            <div key={step} className="relative bg-white border border-green-100 rounded-2xl p-7 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              {/* Step number */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-4xl font-bold text-green-100 leading-none">{step}</span>
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                  <Icon className="w-4 h-4 text-green-700" />
                </div>
              </div>
              <h3 className="font-semibold text-green-900 mb-3">{title}</h3>
              <p className="text-sm text-green-700/70 font-light leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* BanQu callout */}
        {/*<div className="mt-10 bg-green-900 rounded-3xl p-8 md:p-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="w-7 h-7 text-green-400" />
              <span className="font-semibold text-white text-lg">Powered by BanQu</span>
            </div>
            <p className="text-green-200/70 font-light leading-relaxed text-sm">
              GreenKidSA uses the BanQu digital payment system to ensure every community member receives transparent, immediate, and verifiable payment for their recyclables — no bank account required.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Smartphone, label: 'SMS Confirmation', sub: 'Instant receipt to your phone' },
              { icon: ShoppingBag, label: 'Major Retailers', sub: 'Shoprite, Pick \'n Pay & more' },
              { icon: Wallet, label: 'Cash Withdrawal', sub: 'Available immediately' },
              { icon: Banknote, label: 'Bank Transfer', sub: 'Any SA bank account' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <Icon className="w-5 h-5 text-green-400 mb-2" />
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-green-300/60 text-xs font-light mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </div>*/}
      </section>

      <div className="section-line max-w-6xl mx-auto px-6" />

      {/* ── COMMERCIAL & RETAIL AIMS ── */}
      <section className="bg-gradient-to-b from-[#f0f4f1] to-[#e6f0e9] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-xs uppercase tracking-[0.3em] text-green-600 mb-4 font-medium">For Business</span>
              <h2 className="text-3xl md:text-4xl font-semibold text-green-900 leading-tight mb-6">
                Commercial &amp; Retail Collection
              </h2>
              <p className="text-green-800/70 font-light leading-relaxed mb-8">
                GreenKidSA provides tailored recycling and waste solutions for businesses that want to reduce their environmental footprint, lower costs, and demonstrate genuine corporate citizenship — with the documentation to prove it.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="mailto:info@greenkidsa.co.za" className="group inline-flex items-center gap-2 bg-green-900 text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-green-800 transition-colors">
                  Request a Quote
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>

            <div className="space-y-3">
              {COMMERCIAL_AIMS.map((aim, i) => (
                <div key={i} className="flex items-start gap-4 bg-white border border-green-100 rounded-xl px-5 py-4">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-800 font-light leading-relaxed">{aim}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-green-900 py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Users className="w-10 h-10 text-green-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-5">
            Ready to Work With Us?
          </h2>
          <p className="text-green-200/60 font-light leading-relaxed mb-10">
            Whether you're a community group, business, or municipality — contact us to discuss the right waste solution for your needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:0515073592" className="group inline-flex items-center gap-3 bg-white text-green-900 px-8 py-4 rounded-full text-sm font-semibold hover:bg-green-50 transition-colors shadow-lg">
              <Phone className="w-4 h-4" /> 051 507 3592
            </a>
            <a href="mailto:info@greenkidsa.co.za" className="inline-flex items-center gap-2 border border-white/30 text-white/90 px-8 py-4 rounded-full text-sm font-medium hover:bg-white/10 transition-colors">
              info@greenkidsa.co.za
            </a>
          </div>
          <p className="mt-6 text-green-500/60 text-sm font-light">
            Cell: 073 413 3004 · 083 496 8299 &nbsp;·&nbsp; Fax: 051 507 3483
          </p>
        </div>
      </section>
    </div>
  )
}