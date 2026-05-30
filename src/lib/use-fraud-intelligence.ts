import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchFraudData, buildFraudSignals, buildRiskProfiles, buildSummary,
  fetchAlerts, fetchLocks, syncAlerts,
  type FraudSignal, type RiskProfile, type FraudSummary, type FraudAlertRow, type AccountLockRow,
} from "@/lib/fraud-intelligence";

export type FraudState = {
  signals: FraudSignal[];
  profiles: RiskProfile[];
  summary: FraudSummary;
  alerts: FraudAlertRow[];
  locks: AccountLockRow[];
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
};

const EMPTY_SUMMARY: FraudSummary = {
  totalSignals: 0, critical: 0, high: 0, flaggedAccounts: 0, byType: [], topRisk: [],
};

/**
 * Loads fraud signals from real data, persists them to fraud_alerts (so they
 * are realtime + audited + de-duplicated) and keeps everything live.
 */
export function useFraudIntelligence(): FraudState {
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [profiles, setProfiles] = useState<RiskProfile[]>([]);
  const [summary, setSummary] = useState<FraudSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<FraudAlertRow[]>([]);
  const [locks, setLocks] = useState<AccountLockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const syncing = useRef(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const [data, existingAlerts, lockRows] = await Promise.all([
      fetchFraudData(), fetchAlerts(), fetchLocks(),
    ]);
    const sigs = buildFraudSignals(data);
    const profs = buildRiskProfiles(sigs);
    setSignals(sigs);
    setProfiles(profs);
    setSummary(buildSummary(sigs, profs));
    setLocks(lockRows);

    // persist signals (idempotent) then re-read merged alerts
    if (!syncing.current) {
      syncing.current = true;
      await syncAlerts(sigs, existingAlerts);
      const merged = await fetchAlerts();
      setAlerts(merged);
      syncing.current = false;
    } else {
      setAlerts(existingAlerts);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase
      .channel("fraud-intel-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_alerts" }, async () => {
        setAlerts(await fetchAlerts());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "account_locks" }, async () => {
        setLocks(await fetchLocks());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { signals, profiles, summary, alerts, locks, loading, refreshing, reload };
}

/**
 * Lightweight read-only summary used by Executive Dashboard & AI Operations.
 * Reads persisted fraud_alerts so it stays cheap and realtime.
 */
export function useFraudSummary() {
  const [open, setOpen] = useState<FraudAlertRow[]>([]);
  const [locked, setLocked] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [alerts, locks] = await Promise.all([fetchAlerts(), fetchLocks()]);
    setOpen(alerts.filter((a) => a.status === "open" || a.status === "reviewing"));
    setLocked(locks.filter((l) => l.locked).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("fraud-summary-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_alerts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "account_locks" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const critical = open.filter((a) => a.severity === "critical").length;
  const high = open.filter((a) => a.severity === "high").length;
  return { open, critical, high, lockedAccounts: locked, total: open.length, loading };
}
