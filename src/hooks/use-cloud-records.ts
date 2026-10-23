import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLOUD_TABLES, fetchCloudRecords, type CloudTableKey } from "@/lib/cloud-direct";
import type { CloudClinicalRecord } from "@/lib/cloud-queries";

function sameRecordSnapshot(current: CloudClinicalRecord[] | undefined, next: CloudClinicalRecord[]): boolean {
  return current !== undefined && current.length === next.length && current.every((record, i) => record.id === next[i]?.id && record.version === next[i]?.version && record.changedAt === next[i]?.changedAt);
}

export function useCloudRecords(table: CloudTableKey, patientId: string) {
  const [records, setRecords] = useState<CloudClinicalRecord[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) {
      setRecords([]);
      return;
    }
    try {
      const rows = await fetchCloudRecords(CLOUD_TABLES[table], patientId, 200);
      setRecords((current) => sameRecordSnapshot(current, rows) ? current : rows);
      setError(null);
    } catch (cause) {
      setRecords(undefined);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل السجلات من السحابة.");
    }
  }, [table, patientId]);

  useEffect(() => {
    let alive = true;
    setRecords(undefined);
    setError(null);
    const load = async () => {
      if (!patientId) {
        if (alive) setRecords([]);
        return;
      }
      try {
        const rows = await fetchCloudRecords(CLOUD_TABLES[table], patientId, 200);
        if (alive) {
          setRecords((current) => sameRecordSnapshot(current, rows) ? current : rows);
          setError(null);
        }
      } catch (cause) {
        if (alive) {
          setRecords(undefined);
          setError(cause instanceof Error ? cause.message : "تعذر تحميل السجلات من السحابة.");
        }
      }
    };

    void load();
    const channel = (supabase.channel("cloud-records-" + table + "-" + patientId) as any)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: CLOUD_TABLES[table],
        filter: "patient_id=eq." + patientId,
      }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 30000);

    return () => {
      alive = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [table, patientId]);

  return { records, refresh, error };
}
