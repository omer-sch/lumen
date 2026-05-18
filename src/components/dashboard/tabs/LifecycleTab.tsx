"use client";

import { SubscriberLifecycle } from "@/components/dashboard/SubscriberLifecycle";

/**
 * Lifecycle tab - subscriber state. Renders the existing
 * SubscriberLifecycle card which already covers the KPI strip,
 * OS donut, Net Sub bars, and the daily sub / churn rows.
 *
 * Filters relevant on this tab: Date, Client only. OS and Platform
 * chips are hidden from the TopBar when this tab is active because
 * lifecycle's data scope ignores them (the dwh_total_subs query
 * returns all OS regardless of the dashboard filter - see the inline
 * note on the SubscriberLifecycle component).
 *
 * The tab is intentionally a thin wrapper rather than recomposing the
 * inner sections - SubscriberLifecycle already owns the right grid +
 * loading + empty states; reproducing that here would just drift.
 */
export function LifecycleTab() {
  return (
    <div
      className="flex flex-col gap-3 md:gap-4"
      data-testid="lifecycle-tab"
      id="dashboard-tab-panel-lifecycle"
      role="tabpanel"
      aria-labelledby="dashboard-tab-lifecycle"
    >
      <SubscriberLifecycle />
    </div>
  );
}
