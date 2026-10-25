import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileImage, LoaderCircle, Printer, Save, Shuffle, Upload, UserCheck } from "lucide-react";
import {
  createCloudRecord,
  deleteCloudRecord,
  fetchCloudRecordsByField,
  fetchCloudSharedSettings,
  saveCloudSharedSetting,
} from "@/lib/cloud-direct";
import { useCloudFilteredRecords } from "@/hooks/use-cloud-filtered-records";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";
import logoMoh from "@/assets/logo-moh.png.asset.json";
import { buildShiftRoster, type WardShift } from "@/lib/weekly-roster";
import { recognizeWeeklyRoster, type RecognizedRosterRow } from "@/lib/roster-ocr";

export const Route = createFileRoute("/assignment")({
  head: () => ({
    meta: [
      { title: "توزيعة التمريض — جناح 39 | Group Leader's Assignment Plan" },
      {
        name: "description",
        content:
          "Build the Ward 39 group leader's assignment plan: pick the shift, number of nurses and team leader, then print an A4 landscape sheet.",
      },
      { property: "og:title", content: "Group Leader's Assignment Plan — Ward 39" },
      {
        property: "og:description",
        content: "Distribute Ward 39 patients evenly across nurses per shift and print the assignment sheet.",
      },
    ],
  }),
  component: AssignmentPage,
});

const SHIFTS = [
  { key: "morning", label: "7AM-2PM" },
  { key: "evening", label: "2PM-10PM" },
  { key: "night", label: "10PM-7AM" },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y ? `${Number(d)}-${Number(m)}-${y.slice(2)}` : iso;
}

/** Treat "ANNUAL LEAVE TILL dd/mm/yyyy" as leave through the named date. */
function effectiveRosterCode(code: string, assignmentDate: string): string {
  const match = code.match(/LEAVE\\s+TILL\\s+(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})/i);
  if (!match) return code;
  const day = match[1];
  const month = match[2];
  const year = match[3];
  if (!day || !month || !year) return code;
  const until = Date.parse(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
  const selected = Date.parse(`${assignmentDate}T00:00:00Z`);
  return Number.isFinite(until) && Number.isFinite(selected) && selected > until ? "" : code;
}

/** Split patients into `count` groups of as-equal-as-possible size. */
function distribute<T>(items: T[], count: number): T[][] {
  const groups: T[][] = Array.from({ length: count }, () => []);
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  let i = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups[g] = items.slice(i, i + size);
    i += size;
  }
  return groups;
}

function AssignmentPage() {
  const { t, lang } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [rosterStartDate, setRosterStartDate] = useState(today());
  const [rosterRows, setRosterRows] = useState<RecognizedRosterRow[]>([]);
  const [rosterFileName, setRosterFileName] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterSource, setRosterSource] = useState<"saved" | "uploaded" | "">("");
  const [shift, setShift] = useState<string>("morning");
  const [leader, setLeader] = useState("");
  const [wardHeadNurse, setWardHeadNurse] = useState("");
  const [nurseCount, setNurseCount] = useState(6);
  const [nameSize, setNameSize] = useState(11);
  const [nurses, setNurses] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
    const [special, setSpecial] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
    const [seed, setSeed] = useState(0);
    const [leaderNames, setLeaderNames] = useState<string[]>([]);
  const { refresh: refreshAssignments, error: assignmentsError } =
    useCloudFilteredRecords("assignments", "date", date);

    // One team leader per shift: the leader is stored per (date, shift) and
    // loaded automatically so the print sheet always shows the shift's leader.
    useEffect(() => {
      let cancelled = false;
      void fetchCloudSharedSettings("leader:").then((rows) => {
        if (cancelled) return;
        setLeader(rows.find((row) => row.key === `leader:${date}:${shift}`)?.value ?? "");
        setLeaderNames([...new Set(rows.map((row) => row.value).filter(Boolean))]);
      }).catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "تعذر تحميل إعدادات قائد الفريق من السحابة.");
      });
      return () => { cancelled = true; };
    }, [date, shift]);

  useEffect(() => {
    setNurses((prev) => Array.from({ length: nurseCount }, (_, i) => prev[i] ?? ""));
    setSpecial((prev) => Array.from({ length: nurseCount }, (_, i) => prev[i] ?? ""));
  }, [nurseCount]);

  const list = useMemo(() => {
    const arr = [...(patients ?? [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (seed > 0) {
      // simple deterministic rotation so re-shuffling changes who gets whom
      const k = seed % Math.max(arr.length, 1);
      return [...arr.slice(k), ...arr.slice(0, k)];
    }
    return arr;
  }, [patients, seed]);

    // Persist the chosen leader for this (date, shift) as soon as it's set,
    // guaranteeing a single leader per shift that re-appears automatically.
    useEffect(() => {
      const v = leader.trim();
      if (!v) return;
      const t = setTimeout(() => {
        void saveCloudSharedSetting(`leader:${date}:${shift}`, v).catch((error) => { toast.error(error instanceof Error ? error.message : "تعذر حفظ قائد الفريق في السحابة."); });
      }, 400);
      return () => clearTimeout(t);
    }, [leader, date, shift]);

    const groups = useMemo(() => distribute(list, Math.max(nurseCount, 1)), [list, nurseCount]);
  const shiftLabel = SHIFTS.find((s) => s.key === shift)?.label ?? "";
  const rosterDayIndex = Math.floor(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${rosterStartDate}T00:00:00Z`).getTime()) / 86_400_000,
  );
  const rosterDateIsCovered = rosterDayIndex >= 0 && rosterDayIndex <= 6;

  // Load the already-reviewed weekly roster from the cloud when the selected
  // assignment date falls within its seven-day range. No second image upload is needed.
  useEffect(() => {
    let cancelled = false;
    void fetchCloudSharedSettings("weekly-roster:").then((settings) => {
      if (cancelled) return;
      const matching = settings
        .map((item) => {
          if (!item.key.startsWith("weekly-roster:")) return null;
          const startDate = item.key.slice("weekly-roster:".length);
          const day = Math.floor(
            (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
          );
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || day < 0 || day > 6) return null;
          try {
            const parsed = JSON.parse(item.value) as { rows?: RecognizedRosterRow[]; fileName?: string };
            if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null;
            return { startDate, day, rows: parsed.rows, fileName: parsed.fileName ?? "" };
          } catch {
            return null;
          }
        })
        .filter((item): item is { startDate: string; day: number; rows: RecognizedRosterRow[]; fileName: string } => item !== null)
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      if (matching) {
        setRosterStartDate(matching.startDate);
        setRosterRows(matching.rows.map((row, index) => ({
          ...row,
          rowNumber: row.rowNumber ?? index + 1,
          dayCodes: Array.from({ length: 7 }, (_, dayIndex) => row.dayCodes?.[dayIndex] ?? ""),
        })));
        setRosterFileName(matching.fileName);
        setRosterSource("saved");
      } else {
        setRosterRows([]);
        setRosterFileName("");
        setRosterSource("");
      }
    }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "تعذر تحميل جدول العمل الأسبوعي المحفوظ.");
    });
    return () => { cancelled = true; };
  }, [date]);

  async function loadRosterImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(lang === "ar" ? "اختر صورة لجدول العمل." : "Please choose a roster image.");
      return;
    }
    setRosterBusy(true);
    setRosterFileName(file.name);
    setRosterSource("uploaded");
    setRosterRows([]);
    try {
      const result = await recognizeWeeklyRoster(file);
      setRosterRows(result.rows.map((row, index) => ({
        ...row,
        rowNumber: row.rowNumber ?? index + 1,
        dayCodes: Array.from({ length: 7 }, (_, dayIndex) => row.dayCodes[dayIndex] ?? ""),
      })));
      toast.success(lang === "ar"
        ? `تمت قراءة ${result.rows.length} صفًا. راجع الأسماء ورموز الشفتات قبل الاعتماد.`
        : `Read ${result.rows.length} rows. Review names and shift codes before applying.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === "ar" ? "تعذرت قراءة صورة الجدول." : "Could not read the roster image."));
      setRosterRows([]);
    } finally {
      setRosterBusy(false);
    }
  }


  async function saveWeeklyRoster() {
    if (!rosterRows.length) {
      toast.error(lang === "ar" ? "ارفع صورة الجدول أولًا وراجع البيانات." : "Upload a roster image and review its data first.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rosterStartDate)) {
      toast.error(lang === "ar" ? "حدد تاريخ أول يوم في الجدول." : "Choose the first date shown in the roster.");
      return;
    }
    setRosterSaving(true);
    try {
      const payload = JSON.stringify({
        version: 1,
        startDate: rosterStartDate,
        fileName: rosterFileName,
        savedAt: new Date().toISOString(),
        rows: rosterRows.map((row, index) => ({
          rowNumber: row.rowNumber ?? index + 1,
          name: row.name.trim(),
          dayCodes: Array.from({ length: 7 }, (_, dayIndex) => (row.dayCodes?.[dayIndex] ?? "").trim()),
        })),
      });
      await saveCloudSharedSetting(`weekly-roster:${rosterStartDate}`, payload);
      setRosterSource("saved");
      toast.success(lang === "ar"
        ? "تم حفظ جدول الأسبوع في السحابة. سيُحمّل تلقائيًا عند اختيار أي يوم من هذا الأسبوع."
        : "Weekly roster saved to the cloud. It will load automatically for any day in this week.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === "ar" ? "تعذر حفظ جدول الأسبوع في السحابة." : "Could not save the weekly roster to the cloud."));
    } finally {
      setRosterSaving(false);
    }
  }

  function applyRosterToAssignment() {
    if (!rosterDateIsCovered) {
      toast.error(lang === "ar"
        ? "تاريخ التوزيعة خارج نطاق الأسبوع. عدّل تاريخ بداية الجدول أو تاريخ التوزيعة."
        : "The assignment date is outside this roster week. Change the roster start date or assignment date.");
      return;
    }
    const currentDayRows = rosterRows.map((row, index) => ({
      rowNumber: row.rowNumber,
      name: row.name,
      dayCode: effectiveRosterCode(row.dayCodes[rosterDayIndex] ?? "", date),
    }));
    const roster = buildShiftRoster(currentDayRows, shift as WardShift);
    if (!roster.nurses.length) {
      toast.error(lang === "ar"
        ? "لم يتم العثور على ممرضين لهذا الشفت. راجع رموز اليوم المحدد في الجدول."
        : "No nurses found for this shift. Review the selected day's shift codes.");
      return;
    }
    if (roster.nurses.length > 30) {
      toast.error(lang === "ar" ? "عدد الممرضين المستخرج أكبر من الحد المسموح (30)." : "The extracted roster exceeds the 30-nurse limit.");
      return;
    }
    setNurseCount(roster.nurses.length);
    setNurses(roster.nurses);
    setSpecial(Array.from({ length: roster.nurses.length }, () => ""));
    setWardHeadNurse(roster.wardHeadNurse);
    setLeader(roster.teamLeader);
    toast.success(lang === "ar"
      ? `تم إدراج ${roster.nurses.length} ممرضًا بترتيب الجدول، واستبعاد ${roster.excluded.length} إجازة. راجع التوزيعة قبل الحفظ والطباعة.`
      : `Added ${roster.nurses.length} nurses in roster order; excluded ${roster.excluded.length} leave entries. Review before saving or printing.`);
  }

    /** A team leader is mandatory before saving or printing. */
    function requireLeader(): boolean {
      if (!leader.trim()) {
        toast.error(
          lang === "ar"
            ? "يجب اختيار قائد الفريق (Team Leader) لهذه الوردية أولاً"
            : "Please select a team leader for this shift first",
        );
        return false;
      }
      return true;
    }

    async function save() {
      if (!requireLeader()) return;
      try {
        await saveCloudSharedSetting(`leader:${date}:${shift}`, leader.trim());
        const existing = await fetchCloudRecordsByField("staff_assignments", "date", date);
        const oldRows = existing.filter((e) => e["shift"] === shift && e.id);
        const rows = groups.flatMap((g, i) =>
          g
            .filter((p) => p.id)
            .map((p) => ({
              patientId: p.id,
              date,
              shift,
              nurse: nurses[i]?.trim() || `Nurse ${i + 1}`,
              remarks: special[i]?.trim() ?? "",
            })),
        );
        // Publish the new set before removing the previous assignment records.
        for (const row of rows) {
          await createCloudRecord("assignments", String(row.patientId), {
            date: row.date, shift: row["shift"], nurse: row.nurse, remarks: row.remarks,
          });
        }
        for (const row of oldRows) {
          if (row.patientId) await deleteCloudRecord("assignments", row.id, row.patientId, row.version);
        }
        await refreshAssignments();
        toast.success(t("savedOk"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر حفظ توزيع التمريض في السحابة.");
      }
  }

  return (
    <div className="space-y-4">
      {assignmentsError ? <p role="alert" className="text-sm text-destructive">{assignmentsError}</p> : null}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">{t("nurseAssignment")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSeed((s) => s + 1)}>
            <Shuffle />
            {lang === "ar" ? "إعادة التوزيع" : "Redistribute"}
          </Button>
          <Button variant="outline" onClick={save}>
            <Save />
            {t("save")}
          </Button>
            <Button onClick={() => { if (requireLeader()) window.print(); }}>
              <Printer />
              {t("print")}
            </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader
          title={lang === "ar" ? "استيراد جدول العمل الأسبوعي" : "Import weekly work roster"}
          subtitle={lang === "ar"
            ? "ارفع صورة الجدول، راجع الأسماء ورموز الأيام، ثم أدرج ممرضي الشفت تلقائيًا. تتم القراءة داخل المتصفح ولا تُرفع الصورة إلى الخادم."
            : "Upload the roster image, review recognized names and day codes, then import the selected shift. OCR runs in your browser; the image is not uploaded to the server."}
        />
        <div className="space-y-3 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={lang === "ar" ? "صورة جدول العمل" : "Roster image"}>
              <Input
                type="file"
                accept="image/*"
                disabled={rosterBusy}
                onChange={(event) => { void loadRosterImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
              />
              {rosterFileName ? <p className="mt-1 text-xs opacity-70"><FileImage className="me-1 inline h-3.5 w-3.5" />{rosterFileName}</p> : null}
            </Field>
            <Field label={lang === "ar" ? "تاريخ أول يوم في صورة الجدول" : "First date shown in roster"}>
              <Input type="date" value={rosterStartDate} onChange={(event) => setRosterStartDate(event.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button className="w-full" variant="outline" disabled={rosterBusy || !rosterRows.length} onClick={applyRosterToAssignment}>
                <Upload />
                {lang === "ar" ? "إدراج ممرضي الشفت المختار" : "Apply selected shift"}
              </Button>
            </div>
          </div>
          {rosterBusy ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-3 text-sm" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {lang === "ar" ? "جارٍ قراءة الصورة داخل المتصفح..." : "Reading the image in your browser..."}
            </div>
          ) : null}
          {rosterRows.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {lang === "ar"
                    ? `تم التعرف على ${rosterRows.length} صفًا. راجع كل اسم ورمز يوم قبل الإدراج.`
                    : `Recognized ${rosterRows.length} rows. Review every name and selected-day code before applying.`}
                </p>
                {!rosterDateIsCovered ? (
                  <p className="text-sm text-destructive" role="alert">
                    {lang === "ar" ? "تاريخ التوزيعة خارج نطاق الأيام السبعة." : "Assignment date is outside the seven-day roster range."}
                  </p>
                ) : null}
              </div>
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <table className="w-full min-w-[1050px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b px-2 py-2 text-start">#</th>
                      <th className="border-b px-2 py-2 text-start">{lang === "ar" ? "اسم الممرض (قابل للتصحيح)" : "Nurse name (editable)"}</th>
                      {Array.from({ length: 7 }, (_, dayIndex) => {
                        const dayDate = new Date(Date.parse(`${rosterStartDate}T00:00:00Z`) + dayIndex * 86_400_000).toISOString().slice(0, 10);
                        return <th key={dayIndex} className={`border-b px-2 py-2 text-start ${dayIndex === rosterDayIndex ? "bg-primary/10" : ""}`}>
                          {formatDate(dayDate)}
                        </th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((row, index) => (
                      <tr key={index} className="odd:bg-background even:bg-muted/30">
                        <td className="border-b px-2 py-1.5">{index + 1}</td>
                        <td className="border-b px-2 py-1.5">
                          <Input
                            value={row.name}
                            aria-label={`Roster row ${index + 1} name`}
                            onChange={(event) => setRosterRows((previous) => previous.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, name: event.target.value } : item
                            ))}
                          />
                        </td>
                        {Array.from({ length: 7 }, (_, dayIndex) => (
                          <td key={dayIndex} className={`border-b px-2 py-1.5 ${dayIndex === rosterDayIndex ? "bg-primary/5" : ""}`}>
                            <Input
                              value={row.dayCodes[dayIndex] ?? ""}
                              aria-label={`Roster row ${index + 1}, day ${dayIndex + 1} code`}
                              onChange={(event) => setRosterRows((previous) => previous.map((item, rowIndex) =>
                                rowIndex === index ? {
                                  ...item,
                                  dayCodes: item.dayCodes.map((code, codeIndex) => codeIndex === dayIndex ? event.target.value : code),
                                } : item
                              ))}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs opacity-70">
                {lang === "ar"
                  ? "عدّل رموز الأيام السبعة كلها ثم احفظ الجدول مرة واحدة؛ بعدها سيظهر تلقائيًا عند اختيار التاريخ. القواعد: DO وSD والإجازة السنوية مستبعدة؛ الصف الأول يظهر في خانة قائد الفريق فقط؛ أول ممرض مؤهل حسب ترتيب الجدول يصبح قائد الفريق ويظل في أول عمود."
                  : "Edit all seven days and save the roster once; it will then load automatically when selecting a date. Rules: DO, SD and annual leave are excluded; roster row 1 appears only in the team-leader field; the first eligible nurse becomes leader and remains in the first nurse column."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void saveWeeklyRoster()} disabled={rosterSaving || rosterBusy}>
                  {rosterSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {lang === "ar" ? "حفظ جدول الأسبوع في السحابة" : "Save weekly roster to cloud"}
                </Button>
                {rosterSource === "saved" ? <span className="text-xs text-emerald-700">{lang === "ar" ? "جدول محفوظ — لن تحتاج إلى رفع الصورة مرة أخرى" : "Saved roster — no need to upload the image again"}</span> : null}
                <Button variant="outline" onClick={() => setRosterRows((previous) => [...previous, {
                  rowNumber: previous.length + 1, name: "", dayCodes: Array.from({ length: 7 }, () => ""),
                }])}>
                  {lang === "ar" ? "إضافة صف مفقود" : "Add missing row"}
                </Button>
                <Button variant="outline" onClick={() => { setRosterRows([]); setRosterFileName(""); setRosterSource(""); }}>
                  {lang === "ar" ? "مسح نتيجة القراءة" : "Clear OCR results"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="print:hidden">
        <CardHeader
          title={lang === "ar" ? "إعدادات التوزيعة" : "Assignment settings"}
          subtitle={`${list.length} ${lang === "ar" ? "مريض" : "patients"}`}
        />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("shift")}>
            <Select value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={lang === "ar" ? "عدد التمريض" : "Number of nurses"}>
            <Input
              type="number"
              min={1}
              max={30}
              value={nurseCount}
              onChange={(e) => setNurseCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
            <Field label={lang === "ar" ? "قائد الفريق (واحد فقط لكل وردية)" : "Team leader (one per shift)"}>
              <div className="relative">
                <Input
                  value={leader}
                  onChange={(e) => setLeader(e.target.value)}
                  placeholder="S/N ..."
                  list="leader-names"
                  className="pe-8"
                />
                <UserCheck className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              </div>
              <datalist id="leader-names">
                {leaderNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>

          {nurses.map((n, i) => (
            <Field key={i} label={`${lang === "ar" ? "ممرض" : "Nurse"} ${i + 1}`}>
              <Input
                value={n}
                placeholder="S/N ..."
                onChange={(e) =>
                  setNurses((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
              <Input
                className="mt-1"
                value={special[i] ?? ""}
                placeholder={lang === "ar" ? "مهمة خاصة" : "Special assignment"}
                onChange={(e) =>
                  setSpecial((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      {/* Font-size control placed just above the print preview */}
      <div className="print:hidden mx-auto flex w-full max-w-[277mm] items-end justify-center gap-3 py-2">
        <Field
          label={lang === "ar" ? "حجم خط أسماء المرضى" : "Patient name font size"}
          className="flex items-center gap-2"
        >
          <Input
            type="number"
            min={8}
            max={24}
            value={nameSize}
            onChange={(e) => setNameSize(Math.min(24, Math.max(8, Number(e.target.value) || 11)))}
            className="w-24"
          />
        </Field>
      </div>

      {/* ---------- Printable sheet ---------- */}
      <div
        dir="ltr"
        className="mx-auto w-full max-w-[277mm] bg-white p-3 text-black shadow-md print:max-w-none print:p-0 print:shadow-none"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        <div className="flex items-stretch gap-1">
          <div className="flex-1 border-2 border-black">
            {/* logo + date band */}
            <div className="flex items-center justify-between px-2 py-1">
              <img src={logoMoh.url} alt="Ministry of Health" className="h-14 w-auto" />
              <div className="text-sm font-bold">DATE: {formatDate(date)}</div>
            </div>

            <div className="flex flex-wrap border-y border-black text-[10px] font-bold">
              <div className="flex-1 border-e border-black px-1 py-0.5">MINISTRY OF HEALTH</div>
              <div className="flex-1 border-e border-black px-1 py-0.5 text-center">WARD HEAD: {wardHeadNurse || "—"}</div>
              <div className="flex-1 border-e border-black px-1 py-0.5 text-center">TEAM LEADER: {leader || "—"}</div>
              <div className="flex-1 border-e border-black px-1 py-0.5 text-center">WARD: 39</div>
              <div className="flex-1 px-1 py-0.5 text-center">SHIFT {shiftLabel}</div>
            </div>

            <table className="w-full table-fixed border-collapse text-[11px]">
              <tbody>
                <tr className="font-bold">
                  {nurses.map((n, i) => (
                    <th key={i} className="border border-black px-1 py-0.5 text-center">
                      {n || `S/N ${i + 1}`}
                    </th>
                  ))}
                </tr>
                <tr className="font-bold">
                  {nurses.map((_, i) => (
                    <th key={i} className="border border-black px-1 py-0.5 text-center">
                      PATIENT
                    </th>
                  ))}
                </tr>
                <tr>
                  {groups.map((g, i) => (
                    <td key={i} className="h-[105mm] border border-black align-top px-1 py-1">
                      {g.map((p) => (
                        <div
                          key={p.id}
                          className="py-[2px] text-center uppercase leading-tight"
                          style={{ fontSize: `${nameSize}px` }}
                        >
                          {p.name || `FILE ${p.fileNo}`}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
                <tr>
                  {special.map((s, i) => (
                    <td key={i} className="h-[35mm] border border-black align-top px-1 py-1 text-center uppercase">
                      {i === 0 ? (
                        <div className="text-start text-[10px] font-bold">SPECIAL ASSIGNMENT</div>
                      ) : null}
                      <div className="leading-tight">{s}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* vertical side label */}
          <div className="flex w-[14mm] items-center justify-center border-2 border-black">
            <div
              className="whitespace-nowrap text-[11px] font-bold tracking-widest"
              style={{ writingMode: "vertical-rl" }}
            >
              GROUP LEADER'S ASSIGNMENT PLAN&nbsp;&nbsp;&nbsp;NURS 8 B
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
