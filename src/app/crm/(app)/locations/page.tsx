"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Calendar,
  MapPin,
  RefreshCw,
  ShoppingBag,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  type SubscriptionRow,
  type SubscriptionsApiResponse,
  formatINR,
} from "@/lib/crm/subscriptions";
import type { OrderRow, OrdersApiResponse } from "@/lib/crm/orders";
import { aggregateLocations, type LocationCluster } from "@/lib/crm/locations";

const LocationsMap = dynamic(() => import("@/components/crm/locations-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-crm-muted">
      Loading map…
    </div>
  ),
});

type DateFilter = "today" | "all" | "range";

function localDateString(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function CrmLocationsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [dateMode, setDateMode] = useState<DateFilter>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [todayStr, setTodayStr] = useState<string>("");

  const [highlightedPincode, setHighlightedPincode] = useState<string | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const [ordersRes, subsRes] = await Promise.all([
        fetch("/api/crm/orders", { cache: "no-store" }),
        fetch("/api/crm/subscriptions", { cache: "no-store" }),
      ]);
      const ordersData = (await ordersRes.json()) as OrdersApiResponse;
      const subsData = (await subsRes.json()) as SubscriptionsApiResponse;
      if (!ordersRes.ok || !ordersData.success) {
        throw new Error(ordersData.error || "Orders request failed");
      }
      setOrders(Array.isArray(ordersData.rows) ? ordersData.rows : []);
      setSubs(subsData.success && Array.isArray(subsData.rows) ? subsData.rows : []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    setTodayStr(localDateString(new Date()));
  }, [fetchAll]);

  // Apply the date filter to orders before aggregating
  const filteredOrders = useMemo(() => {
    if (dateMode === "all") return orders;
    if (dateMode === "today") {
      if (!todayStr) return orders;
      return orders.filter((o) => localDateString(o.timestamp) === todayStr);
    }
    if (dateMode === "range") {
      return orders.filter((o) => {
        const key = localDateString(o.timestamp);
        if (!key) return false;
        if (startDate && key < startDate) return false;
        if (endDate && key > endDate) return false;
        return true;
      });
    }
    return orders;
  }, [orders, dateMode, todayStr, startDate, endDate]);

  const clusters: LocationCluster[] = useMemo(
    () => aggregateLocations(filteredOrders, subs),
    [filteredOrders, subs]
  );

  const totalCustomers = clusters.reduce((s, c) => s + c.customers.length, 0);
  const totalOrders = clusters.reduce((s, c) => s + c.totalOrders, 0);
  const totalRevenue = clusters.reduce((s, c) => s + c.totalRevenue, 0);

  // Orders with NO pincode at all — flag them so the user knows
  const ordersMissingPincode = filteredOrders.filter(
    (o) => !String(o.deliveryPinCode ?? "").trim()
  ).length;

  const dateModeLabel: Record<DateFilter, string> = {
    today: "Today",
    all: "All time",
    range: "Date range",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-crm-red">
            Locations
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-crm-ink">
            Where your customers are · {dateModeLabel[dateMode]}
            {dateMode === "range" && (startDate || endDate) ? ` (${startDate || "any"} to ${endDate || "any"})` : ""}
          </h1>
          {!loading && (
            <p className="mt-0.5 text-xs text-crm-muted">
              From Bhookr Orders database · {clusters.length} neighbourhood
              {clusters.length === 1 ? "" : "s"} · last updated{" "}
              {lastUpdated?.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value as DateFilter)}
            aria-label="Date filter"
            className="rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm text-crm-ink focus:border-crm-red focus:outline-none focus:ring-1 focus:ring-crm-red"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="range">Date range…</option>
          </select>
          {dateMode === "range" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1.5 text-sm">
                <span className="text-xs text-crm-muted font-medium">From:</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || todayStr}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-sm text-crm-ink focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-crm border border-crm-line bg-crm-surface px-2.5 py-1.5 text-sm">
                <span className="text-xs text-crm-muted font-medium">To:</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={todayStr}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-sm text-crm-ink focus:outline-none"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="text-xs text-crm-muted hover:text-crm-ink-soft font-medium bg-crm-cream hover:bg-crm-cream-deep px-2 py-1.5 rounded-crm border border-crm-line"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => fetchAll()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-crm border border-crm-line bg-crm-surface px-3 py-2 text-sm font-medium text-crm-ink-soft transition hover:bg-crm-cream disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-crm border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">
              Couldn&apos;t load locations
            </p>
            <p className="mt-0.5 text-red-800">{error}</p>
          </div>
        </div>
      )}

      {ordersMissingPincode > 0 && (
        <div className="rounded-crm border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />{ordersMissingPincode} order
          {ordersMissingPincode === 1 ? " is" : "s are"} missing a pincode in the
          database — those aren&apos;t shown on the map.
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Neighbourhoods" value={clusters.length} icon={MapPin} />
        <KpiCard label="Customers" value={totalCustomers} icon={Users} />
        <KpiCard label="Orders" value={totalOrders} icon={ShoppingBag} />
        <KpiCard label="Revenue" value={formatINR(totalRevenue)} icon={ShoppingBag} tone="primary" />
      </div>

      {/* Map + list grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="h-[500px] overflow-hidden rounded-crm border border-crm-line bg-crm-cream lg:h-[600px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-crm-muted">
              Loading orders + map…
            </div>
          ) : clusters.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-crm-muted">
              No customer locations in this window. Try switching to All time, or
              pick a different date.
            </div>
          ) : (
            <LocationsMap
              clusters={clusters}
              highlightedPincode={highlightedPincode}
            />
          )}
        </div>

        <div className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface">
          <div className="border-b border-crm-line px-4 py-3">
            <h2 className="text-sm font-semibold text-crm-ink-soft">
              Top neighbourhoods
            </h2>
            <p className="text-[11px] text-crm-muted">
              Click a row to highlight on the map
            </p>
          </div>
          <ul className="max-h-[550px] divide-y divide-crm-line overflow-y-auto">
            {loading ? (
              <li className="px-4 py-3 text-sm text-crm-muted">Loading…</li>
            ) : clusters.length === 0 ? (
              <li className="px-4 py-3 text-sm text-crm-muted">No data</li>
            ) : (
              clusters.map((c) => (
                <li
                  key={c.pincode}
                  onMouseEnter={() => setHighlightedPincode(c.pincode)}
                  onMouseLeave={() => setHighlightedPincode(null)}
                  className={`cursor-pointer px-4 py-3 transition ${
                    highlightedPincode === c.pincode
                      ? "bg-red-50"
                      : "hover:bg-crm-cream"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-crm-ink">
                        {c.area}
                        {!c.known && (
                          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
                            approx.
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-crm-muted">
                        Pincode {c.pincode} · {c.customers.length} customer
                        {c.customers.length === 1 ? "" : "s"} · {c.totalOrders}{" "}
                        order{c.totalOrders === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-crm-ink">
                      {formatINR(c.totalRevenue)}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <p className="text-xs text-crm-muted">
        Pins are placed at the centre of each pincode area (approximate).
        Subscriptions in your database currently have empty delivery addresses, so
        only Order-customer locations appear here. Once subscription delivery
        fields are filled, those will appear too.
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary";
}) {
  return (
    <div className="rounded-crm border border-crm-line bg-crm-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-crm-muted">
          {label}
        </p>
        <Icon
          className={`h-4 w-4 ${
            tone === "primary" ? "text-crm-red" : "text-crm-muted"
          }`}
        />
      </div>
      <p className="mt-2 text-2xl font-bold text-crm-ink">{value}</p>
    </div>
  );
}
