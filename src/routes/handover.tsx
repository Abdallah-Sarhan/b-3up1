import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, Clock, Users } from "lucide-react";
import { db, dbReady } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Badge, Card, CardHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/handover")({
  head: () => ({
    meta: [
      { title: "تسليم الوردية — جناح 39 | Shift Handover — Ward 39" },
      {
        name: "description",
        content: "Ward 39 shift handover board: current patients, vitals due, nurse assignments and today's SBAR coverage.",
      },
      { property: "og:title", content: "Shift Handover — Ward 39" },
      {
        property: "og:description",
        content: "Live handover board with vitals due, nurse assignments and SBAR coverage for Ward 39.",
      },
    ],
  }),
  component: HandoverPage,
});

const SHIFTS = ["morning", "evening", "night"] as const;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function HandoverPage() {
  const { t, lang } = useLang();
  const today = todayStr();

  const data = useLiveQuery(async () => {
    await dbReady;
    const all = await db.patients.orderBy("name").toArray();
    const patients = all.filter((p) => !p.dischargedAt);
    const [vitals, sbar, assignments] = await Promise.all([
      db.vitals.toArray(),
      db.sbar.where("date").equals(today).toArray(),
      db.assignments.where("date").equals(today).toArray(),
    ]);
    return { patients, vitals, sbar, assignments };
  }, [today]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.patients.map((p) => {
      const v = data.vitals
        .filter((x) => x.patientId === p.id)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .at(-1);
      const shifts = Object.fromEntries(
        SHIFTS.map((s) => [s, data.sbar.some((e) => e.patientId === p.id && e.shift === s)]),
      ) as Record<(typeof SHIFTS)[number], boolean>;
      const nurses = data.assignments
        .filter((a) => a.patientId === p.id)
        .map((a) => `${a.nurse}${a.shift ? ` (${a.shift})` : ""}`);
      return { p, v, shifts, nurses, vitalsToday: v?.date === today };
    });
  }, [data, today]);

  const due = rows.filter((r) => !r.vitalsToday);
  const unassigned = rows.filter((r) => r.nurses.length === 0);
  const sbarMissing = rows.filter((r) => !SHIFTS.some((s) => r.shifts[s]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("handover")}</h1>
      <p className="text-sm text-muted-foreground">{today}</p>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={Users} label={t("activePatients")} value={rows.length} />
        <Stat icon={Clock} label={t("vitalsDue")} value={due.length} tone={due.length ? "warn" : "ok"} />
        <Stat
          icon={AlertTriangle}
          label={t("unassigned")}
          value={unassigned.length}
          tone={unassigned.length ? "warn" : "ok"}
        />
        <Stat
          icon={CheckCircle2}
          label={t("todaySbar")}
          value={`${rows.length - sbarMissing.length}/${rows.length}`}
          tone={sbarMissing.length ? "warn" : "ok"}
        />
      </div>

      <Card>
        <CardHeader title={t("activePatients")} subtitle={String(rows.length)} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-start">
              <tr>
                <Th>{t("name")}</Th>
                <Th>{t("room")}/{t("bed")}</Th>
                <Th>{t("lastVitals")}</Th>
                <Th>{t("nurse")}</Th>
                <Th>{t("todaySbar")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ p, v, shifts, nurses, vitalsToday }) => (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2">
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: String(p.id) }}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.name || `${t("fileNo")} ${p.fileNo}`}
                    </Link>
                    <div className="text-xs text-muted-foreground">{p.diagnosis}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {[p.room, p.bed].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {v ? (
                      <span className={vitalsToday ? "" : "text-destructive"}>
                        {v.date} {v.time} · BP {v.bp || "—"} · P {v.pulse || "—"} · T {v.temp || "—"}
                      </span>
                    ) : (
                      <span className="text-destructive">{t("noVitalsToday")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {nurses.length ? (
                      nurses.join("، ")
                    ) : (
                      <span className="text-muted-foreground">{t("unassigned")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {SHIFTS.map((s) => (
                        <Badge
                          key={s}
                          className={
                            shifts[s]
                              ? "border-transparent bg-primary/10 text-primary"
                              : "border-transparent bg-muted text-muted-foreground"
                          }
                        >
                          {t(s)} {shifts[s] ? "✓" : "—"}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    {t("noEntries")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/print/all/$form"
          params={{ form: "sbar" }}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary hover:bg-accent"
        >
          {lang === "ar" ? "طباعة SBAR للجميع" : "Print SBAR for all"}
        </Link>
        <Link
          to="/assignment"
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary hover:bg-accent"
        >
          {t("nurseAssignment")}
        </Link>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start font-semibold">{children}</th>;
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "plain",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone?: "plain" | "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === "warn" ? "text-destructive" : tone === "ok" ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
