import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveCloudPatients, fetchAllCloudPatients, type CloudPatient } from "@/lib/cloud-queries";

/** Cloud-backed patient list. Full history is fetched only for screens that request it explicitly. */
export function useCloudPatients(includeDischarged = false) {
  const [patients, setPatients] = useState<CloudPatient[] | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    let failureReported = false;
    const load = async () => {
      try {
        const rows = includeDischarged
          ? await fetchAllCloudPatients()
          : await fetchActiveCloudPatients();
        if (alive) setPatients(rows);
        failureReported = false;
      } catch (error) {
        console.error("Failed to load patients from Supabase", error);
        if (alive) {
          setPatients([]);
          if (!failureReported) {
            toast.error(error instanceof Error ? error.message : "تعذر تحميل المرضى من السحابة.");
          }
        }
        failureReported = true;
      }
    };
    void load();
    const channel = supabase.channel(includeDischarged ? "ward39-all-patients" : "ward39-active-patients-hook")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => { void load(); })
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [includeDischarged]);

  return patients;
}
