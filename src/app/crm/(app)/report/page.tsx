"use client";

import React, { useState } from "react";
import { 
  FileText, 
  Database, 
  CreditCard, 
  BarChart, 
  Layout, 
  Download, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  Coins,
  ShieldCheck,
  Check
} from "lucide-react";

interface ModuleDetail {
  title: string;
  cost: number;
  icon: React.ComponentType<{ className?: string }>;
  complexity: "High" | "Very High" | "Medium-High" | "Medium";
  complexityColor: string;
  bgIconColor: string;
  description: string;
  features: string[];
  files: string[];
}

const MODULES_DATA: ModuleDetail[] = [
  {
    title: "Google Sheets Real-Time Sync Engine",
    cost: 15000,
    icon: Database,
    complexity: "High",
    complexityColor: "text-orange-600 bg-orange-50 border-orange-200",
    bgIconColor: "bg-emerald-50 text-emerald-600",
    description: "Built two-way, real-time synchronization between the database and Google Sheets using customized Google Apps Script REST endpoints deployed as standalone Web Apps.",
    features: [
      "Leads Sync (leads-sheet-script.gs): Tracks users on the 7-step onboarding wizard. Detects existing users via email, performing automatic data updates to prevent customer duplicates.",
      "Orders Sync (orders-sheet-script.gs): Formats multi-meal checkout items, calculating subtotal, food GST (5%), delivery base, delivery GST (18%), and final grand totals.",
      "Subscriptions Sync (subscriptions-sheet-script.gs): Captures transaction details, start dates, and status codes (Success, Failed, Pending) with visual color formatting and cancellation logging inside sheet cell notes."
    ],
    files: [
      "google-apps-scripts/leads-sheet-script.gs",
      "google-apps-scripts/orders-sheet-script.gs",
      "google-apps-scripts/subscriptions-sheet-script.gs"
    ]
  },
  {
    title: "Razorpay Billing & Webhooks Engine",
    cost: 22000,
    icon: CreditCard,
    complexity: "Very High",
    complexityColor: "text-red-600 bg-red-50 border-red-200",
    bgIconColor: "bg-red-50 text-crm-red",
    description: "Integrated Razorpay's Node SDK for transaction processing, combining a custom CRM invoice builder, secure webhooks, and automated pipeline conversion checks.",
    features: [
      "Invoice Builder Component: Staff can dynamically select/add plan line-items directly from the live Razorpay catalog, deduct discounts, apply integer GST rates (5% vs 18%), and issue invoices.",
      "Automated Counter & Address Sync: Syncs sequential invoice numbers using a Firestore transaction counter, and recovers client address histories to pre-fill billing details.",
      "HMAC Webhook verification: Validates payments with HMAC-SHA256 signatures, listening for invoice/link success hook alerts to auto-move CRM leads to 'Converted' status.",
      "Refund API Integration: Fully captures refund hooks and processes order status updates."
    ],
    files: [
      "src/components/crm/payment-link-modal.tsx",
      "src/app/api/crm/payment/create-invoice/route.ts",
      "src/app/api/payment/webhook/route.ts",
      "src/lib/payment/razorpay.ts"
    ]
  },
  {
    title: "CRM Lead Pipeline Board & Caching",
    cost: 12000,
    icon: Layout,
    complexity: "Medium-High",
    complexityColor: "text-blue-600 bg-blue-50 border-blue-200",
    bgIconColor: "bg-blue-50 text-blue-600",
    description: "Developed the core administrative platform for tracking leads, subscriptions, customers, and orders, complete with filtering, fast client-side caching, and search logic.",
    features: [
      "Master Pipeline Board: A drag-and-drop state tracker allowing staff to update customer stages from uncontacted to converted, storing status updates directly in Firestore.",
      "In-Memory Client Cache: Bypasses redundant database fetch requests on page navigation, saving Firebase operations and improving screen loads.",
      "Search & Filters: Instant lookup querying names, emails, or phone numbers, alongside Date Range filters (Today, All time, custom ranges)."
    ],
    files: [
      "src/components/crm/master-pipeline.tsx",
      "src/app/crm/(app)/leads/page.tsx",
      "src/lib/crm/pipeline.ts",
      "src/lib/crm/permissions.ts"
    ]
  },
  {
    title: "Marketing Funnel Tracking (FB Pixel)",
    cost: 6000,
    icon: BarChart,
    complexity: "Medium",
    complexityColor: "text-indigo-600 bg-indigo-50 border-indigo-200",
    bgIconColor: "bg-indigo-50 text-indigo-600",
    description: "Mapped conversion events to monitor and optimize Facebook marketing spend throughout the registration wizard and payment checkout pages.",
    features: [
      "Funnel Telemetry: Captures InitiateCheckout, AddPaymentInfo, CompleteRegistration, and StartTrial/Subscribe.",
      "Value-Based Purchases: Dispatches standard 'Purchase' tracking events to Facebook Pixel upon payment confirmations, reporting order amounts for ROI tracking."
    ],
    files: [
      "src/lib/fpixel.ts",
      "src/components/payment/razorpay-checkout.tsx",
      "src/app/subscribe/page.tsx",
      "src/app/checkout/page.tsx"
    ]
  },
  {
    title: "Admin Data Exports (Excel & PDF)",
    cost: 6000,
    icon: Download,
    complexity: "Medium",
    complexityColor: "text-purple-600 bg-purple-50 border-purple-200",
    bgIconColor: "bg-purple-50 text-purple-600",
    description: "Provided clean reporting tools so that management can download logs or print out structured PDF reports for accounting audits.",
    features: [
      "CSV Sheet Export: Extracts lead datasets and encodes them into standard Excel/Google Sheets compatible files.",
      "Print PDF Engine: Generates print-formatted reports with brand colors, dates, and total counts directly in the browser."
    ],
    files: [
      "src/components/crm/master-pipeline.tsx",
      "src/app/crm/(app)/analytics/page.tsx"
    ]
  }
];

export default function ProjectReportPage() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [printLoading, setPrintLoading] = useState(false);

  const handlePrint = () => {
    setPrintLoading(true);
    setTimeout(() => {
      window.print();
      setPrintLoading(false);
    }, 300);
  };

  const totalCost = MODULES_DATA.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="space-y-6 pb-12 print:p-0 print:space-y-4">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-crm border border-crm-line bg-crm-surface p-6 shadow-sm print:border-0 print:shadow-none print:p-0">
        <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-red-500/10 print:hidden" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Scope Completed
              </span>
              <span className="text-xs text-crm-muted">Ver. 1.0 (Production)</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-crm-ink sm:text-3xl">
              CRM Integration & Upgrade Report
            </h1>
            <p className="mt-1 text-sm text-crm-muted">
              Contract Deliverable Scope Breakdown for Bhookr Fresh Meal Subscriptions
            </p>
          </div>
          <button
            onClick={handlePrint}
            disabled={printLoading}
            className="inline-flex items-center justify-center gap-2 rounded-crm bg-crm-red hover:bg-crm-red-hover px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 print:hidden"
          >
            <FileText className="h-4 w-4" />
            {printLoading ? "Preparing Print..." : "Print / Save PDF"}
          </button>
        </div>

        {/* Topline summary grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-crm-line pt-6 sm:grid-cols-4">
          <div>
            <span className="text-xs text-crm-muted">Total Scoped Value</span>
            <p className="text-2xl font-extrabold text-crm-red">₹{totalCost.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-xs text-crm-muted">Delivery Status</span>
            <p className="text-sm font-bold text-emerald-600 flex items-center gap-1 mt-1">
              <ShieldCheck className="h-4 w-4" /> Active & Deployed
            </p>
          </div>
          <div>
            <span className="text-xs text-crm-muted">Modules Completed</span>
            <p className="text-lg font-bold text-crm-ink mt-1">5 Core Systems</p>
          </div>
          <div>
            <span className="text-xs text-crm-muted">Development Time</span>
            <p className="text-lg font-bold text-crm-ink mt-1">Completed Q2 2026</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Tabs + Module Details */}
      <div className="grid gap-6 md:grid-cols-12 print:grid-cols-1">
        {/* Navigation Sidebar */}
        <div className="md:col-span-4 space-y-3 print:hidden">
          <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">
            Select Module to Inspect
          </p>
          <div className="flex flex-col gap-1.5">
            {MODULES_DATA.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeTab === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`flex items-start gap-3 rounded-crm border p-3.5 text-left transition ${
                    isActive
                      ? "border-red-200 bg-red-50/50 text-crm-red"
                      : "border-crm-line bg-crm-surface text-crm-ink-soft hover:bg-crm-cream hover:text-crm-ink"
                  }`}
                >
                  <div className={`rounded-crm p-2 shrink-0 ${
                    isActive 
                      ? "bg-red-100 text-crm-red" 
                      : "bg-crm-cream-deep text-crm-muted"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${isActive ? "text-crm-red" : "text-crm-ink"}`}>
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-crm-muted">
                      Value: ₹{item.cost.toLocaleString()}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detailed Module Display */}
        <div className="md:col-span-8 bg-crm-surface border border-crm-line rounded-crm p-6 print:col-span-1 print:border-0 print:p-0">
          {/* Loop for print (shows all modules) or tab selection for web screen */}
          {MODULES_DATA.map((module, idx) => {
            const Icon = module.icon;
            const isVisible = activeTab === idx;
            
            return (
              <div 
                key={idx} 
                className={`${isVisible ? "block" : "hidden"} space-y-5 print:block print:border-b print:border-crm-line print:pb-6 print:mb-6 print:last:border-0 print:last:pb-0 print:last:mb-0`}
              >
                {/* Module Title Card */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className={`rounded-crm p-3 shrink-0 ${module.bgIconColor} print:hidden`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-crm-ink sm:text-xl">
                        {module.title}
                      </h2>
                      <p className="mt-1 text-xs text-crm-muted">
                        Scope Ref: #00{idx + 1}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:flex-col sm:items-end">
                    <span className="text-xl font-extrabold text-crm-red">
                      ₹{module.cost.toLocaleString()}
                    </span>
                    <span className={`inline-flex items-center rounded-crm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${module.complexityColor}`}>
                      {module.complexity} complexity
                    </span>
                  </div>
                </div>

                <hr className="border-crm-line print:hidden" />

                {/* Description */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-crm-muted mb-1.5">
                    Operational Scope
                  </h3>
                  <p className="text-sm text-crm-ink-soft leading-relaxed">
                    {module.description}
                  </p>
                </div>

                {/* Features Checklist */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-crm-muted">
                    Delivered Features & Logic
                  </h3>
                  <ul className="space-y-2">
                    {module.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2 text-sm text-crm-ink-soft">
                        <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Code files mapped */}
                <div className="rounded-crm border border-crm-line bg-crm-cream/50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-crm-muted mb-2">
                    Files Mapped in Workspace
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {module.files.map((file, fileIdx) => (
                      <code key={fileIdx} className="rounded-crm border border-gray-250 bg-crm-surface px-2 py-0.5 text-[11px] font-mono text-crm-ink-soft">
                        {file.split('/').pop()}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Value Summary Matrix */}
      <div className="rounded-crm border border-crm-line bg-crm-surface p-6 shadow-sm print:break-before-page">
        <h2 className="text-lg font-bold text-crm-ink flex items-center gap-2">
          <Coins className="h-5 w-5 text-crm-red" /> Value Allocation Summary Matrix
        </h2>
        <p className="text-xs text-crm-muted mt-0.5">
          Breakdown mapping of deliverables to the ₹61,000 project fee.
        </p>

        <div className="mt-6 space-y-4">
          {/* Progress bar visualizer */}
          <div className="h-3 w-full rounded-full bg-crm-cream-deep flex overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(15000/totalCost)*100}%` }} title="Google Sheets: 24.6%" />
            <div className="h-full bg-crm-red" style={{ width: `${(22000/totalCost)*100}%` }} title="Razorpay Billing: 36.1%" />
            <div className="h-full bg-blue-500" style={{ width: `${(12000/totalCost)*100}%` }} title="CRM Board: 19.7%" />
            <div className="h-full bg-indigo-500" style={{ width: `${(6000/totalCost)*100}%` }} title="FB Pixel: 9.8%" />
            <div className="h-full bg-purple-500" style={{ width: `${(6000/totalCost)*100}%` }} title="Admin Exports: 9.8%" />
          </div>
          
          {/* Legend matrix with prices */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-crm-ink">Google Sheets Sync</span>
                <span className="text-crm-muted block">₹15,000 (24.6%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-crm-red shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-crm-ink">Razorpay Invoicing</span>
                <span className="text-crm-muted block">₹22,000 (36.1%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-blue-500 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-crm-ink">CRM Pipeline Dashboard</span>
                <span className="text-crm-muted block">₹12,000 (19.7%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-indigo-500 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-crm-ink">FB Pixel Funnel</span>
                <span className="text-crm-muted block">₹6,000 (9.8%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-purple-500 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-crm-ink">Admin Data Exports</span>
                <span className="text-crm-muted block">₹6,000 (9.8%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Billing breakdown summary footer */}
        <div className="mt-6 border-t border-crm-line pt-4 flex flex-col justify-between sm:flex-row sm:items-center">
          <p className="text-xs text-crm-muted">
            Note: Dev modules are mapped to core file commits. Delivery is active under branch production.
          </p>
          <div className="mt-2 text-right sm:mt-0">
            <span className="text-xs text-crm-muted">Invoicing Total</span>
            <p className="text-lg font-black text-crm-ink">₹{totalCost.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
