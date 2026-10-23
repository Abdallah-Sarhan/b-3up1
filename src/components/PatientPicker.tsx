import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveCloudPatients, type CloudPatient } from "@/lib/cloud-queries";
import { useLang } from "@/lib/i18n";
import { Input } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function useActivePatients(): CloudPatient[] | undefined {
  const [patients, setPatients] = useState<CloudPatient[]>();
  useEffect(() => {
    let alive = true;
    let failureReported = false;
    const load = async () => {
      try {
        const rows = await fetchActiveCloudPatients();
        if (alive) setPatients(rows);
        failureReported = false;
      } catch (error) {
        console.error("Failed to read active patients from Supabase", error);
        if (alive) {
          setPatients([]);
          if (!failureReported) {
            toast.error(error instanceof Error ? error.message : "تعذر تحميل قائمة المرضى من السحابة.");
          }
        }
        failureReported = true;
      }
    };
    void load();
    const channel = supabase.channel("ward39-active-patients")
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
  }, []);
  return patients;
}

function labelOf(p: CloudPatient, fileNoLabel: string): string {
  return (p.name || `${fileNoLabel} ${p.fileNo}`) + (p.room ? ` — ${p.room}` : "");
}

export function PatientPicker({
  value,
  onChange,
  patients,
}: {
  value: string | "";
  onChange: (id: string | "") => void;
  patients: CloudPatient[] | undefined;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value === "" ? undefined : patients?.find((p) => p.id === value)),
    [patients, value],
  );

  const display = open ? query : selected ? labelOf(selected, t("fileNo")) : "";

  const matches = useMemo(() => {
    if (!patients) return [];
    const q = query.trim().toLowerCase();
    const list = !q
      ? patients
      : patients.filter(
          (p) =>
            (p.name || "").toLowerCase().includes(q) ||
            (p.fileNo || "").toLowerCase().includes(q) ||
            (p.cid || "").toLowerCase().includes(q),
        );
    return list.slice(0, 50);
  }, [patients, query]);

  useEffect(() => {
    setActive(-1);
  }, [matches]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(p: CloudPatient) {
    onChange(p.id);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const m = matches[active];
      if (active >= 0 && m) {
        e.preventDefault();
        pick(m);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={display}
        placeholder={t("selectPatient")}
        className="ps-9 pe-9"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {value !== "" && !open ? (
        <button
          type="button"
          onClick={clear}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t("clear")}
        >
          <X className="size-4" />
        </button>
      ) : null}
      {open ? (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">{t("noResults")}</div>
          ) : (
            matches.map((p, i) => (
              <div
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm text-foreground hover:bg-accent",
                  active === i && "bg-accent text-accent-foreground",
                )}
              >
                <div className="font-medium">{p.name || `${t("fileNo")} ${p.fileNo}`}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {p.fileNo}
                  {p.cid ? ` · ${p.cid}` : ""}
                  {p.room ? ` · ${p.room}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
