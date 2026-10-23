import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLOUD_TABLES, fetchCloudRecordsByField, type CloudTableKey } from "@/lib/cloud-direct";
import type { CloudClinicalRecord } from "@/lib/cloud-queries";

export function useCloudFilteredRecords(
  table: CloudTableKey,
  field: string,
  value: string | number,
) {
  const [records, setRecords] = useState<CloudClinicalRecord[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchCloudRecordsByField(CLOUD_TABLES[table], field, value);
      setRecords(rows);
      setError(null);
    } catch (cause) {
      setRecords(undefined);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل السجلات من السحابة.");
    }
  }, [table, field, value]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await fetchCloudRecordsByField(CLOUD_TABLES[table], field, value);
        if (alive) {
          setRecords(rows);
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
    const channel = (supabase.channel("cloud-filter-" + table + "-" + field + "-" + value) as any)
      .on("postgres_changes", { event: "*", schema: "public", table: CLOUD_TABLES[table] }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [table, field, value]);

  return { records, refresh, error };
}
