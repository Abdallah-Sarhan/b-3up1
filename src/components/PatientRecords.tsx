import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db, type CarePlanEntry, type NurseNote, type SbarEntry, type VitalEntry } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { STANDARD_PROBLEMS } from "@/lib/careplan-standards";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui-kit";

const TABS = ["vitals", "nurseNotes", "sbar", "careplan"] as const;
type Tab = (typeof TABS)[number];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export function PatientRecords({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("vitals");

  return (
    <Card>
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t(k)}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab === "vitals" && <VitalsTab patientId={patientId} />}
        {tab === "nurseNotes" && <NotesTab patientId={patientId} />}
        {tab === "sbar" && <SbarTab patientId={patientId} />}
        {tab === "careplan" && <CarePlanTab patientId={patientId} />}
      </div>
    </Card>
  );
}

function EntryTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`border-b border-border/50 px-3 py-2 align-top last:border-0 ${mono ? "font-mono text-xs" : ""}`}>
      {children}
    </td>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-muted-foreground hover:text-destructive" aria-label="delete">
      <Trash2 className="size-4" />
    </button>
  );
}

function VitalsTab({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const entries = useLiveQuery(
    () => db.vitals.where("patientId").equals(patientId).reverse().sortBy("date"),
    [patientId],
  );
  const [form, setForm] = useState({ date: today(), time: nowTime(), bp: "", pulse: "", resp: "", temp: "", spo2: "", weight: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add() {
    const entry: VitalEntry = { patientId, ...form };
    await db.vitals.add(entry);
    setForm((f) => ({ ...f, bp: "", pulse: "", resp: "", temp: "", spo2: "", weight: "" }));
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        <Field label={t("date")}><Input type="date" value={form.date} onChange={set("date")} dir="ltr" /></Field>
        <Field label={t("time")}><Input type="time" value={form.time} onChange={set("time")} dir="ltr" /></Field>
        <Field label={t("bp")}><Input value={form.bp} onChange={set("bp")} dir="ltr" placeholder="120/80" /></Field>
        <Field label={t("pulse")}><Input value={form.pulse} onChange={set("pulse")} dir="ltr" /></Field>
        <Field label={t("resp")}><Input value={form.resp} onChange={set("resp")} dir="ltr" /></Field>
        <Field label={t("temp")}><Input value={form.temp} onChange={set("temp")} dir="ltr" placeholder="37.0" /></Field>
        <Field label={t("spo2")}><Input value={form.spo2} onChange={set("spo2")} dir="ltr" placeholder="98" /></Field>
        <Field label={t("weight")}><Input value={form.weight} onChange={set("weight")} dir="ltr" /></Field>
        <div className="flex items-end">
          <Button onClick={add} className="w-full"><Plus />{t("add")}</Button>
        </div>
      </div>
      {!entries?.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <EntryTable head={[t("date"), t("time"), t("bp"), t("pulse"), t("resp"), t("temp"), t("spo2"), t("weight"), ""]}>
          {entries.map((v) => (
            <tr key={v.id}>
              <Td mono>{v.date}</Td><Td mono>{v.time}</Td><Td mono>{v.bp}</Td><Td mono>{v.pulse}</Td>
              <Td mono>{v.resp}</Td><Td mono>{v.temp}</Td><Td mono>{v.spo2}</Td><Td mono>{v.weight}</Td>
              <Td><DeleteBtn onClick={() => db.vitals.delete(v.id!)} /></Td>
            </tr>
          ))}
        </EntryTable>
      )}
    </div>
  );
}

function NotesTab({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const entries = useLiveQuery(
    () => db.notes.where("patientId").equals(patientId).reverse().sortBy("date"),
    [patientId],
  );
  const [form, setForm] = useState({ date: today(), time: nowTime(), note: "" });

  async function add() {
    if (!form.note.trim()) return;
    const entry: NurseNote = { patientId, ...form };
    await db.notes.add(entry);
    setForm((f) => ({ ...f, note: "" }));
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_120px_1fr_auto]">
        <Field label={t("date")}><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} dir="ltr" /></Field>
        <Field label={t("time")}><Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} dir="ltr" /></Field>
        <Field label={t("note")}><Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
        <div className="flex items-end">
          <Button onClick={add}><Plus />{t("add")}</Button>
        </div>
      </div>
      {!entries?.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <EntryTable head={[t("date"), t("time"), t("note"), ""]}>
          {entries.map((n) => (
            <tr key={n.id}>
              <Td mono>{n.date}</Td><Td mono>{n.time}</Td><Td>{n.note}</Td>
              <Td><DeleteBtn onClick={() => db.notes.delete(n.id!)} /></Td>
            </tr>
          ))}
        </EntryTable>
      )}
    </div>
  );
}

function SbarTab({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const entries = useLiveQuery(
    () => db.sbar.where("patientId").equals(patientId).reverse().sortBy("date"),
    [patientId],
  );
  const [form, setForm] = useState({
    date: today(), shift: "morning", situation: "", background: "", assessment: "", recommendation: "", signature: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add() {
    const entry: SbarEntry = { patientId, ...form };
    await db.sbar.add(entry);
    setForm((f) => ({ ...f, situation: "", background: "", assessment: "", recommendation: "" }));
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("date")}><Input type="date" value={form.date} onChange={set("date")} dir="ltr" /></Field>
        <Field label={t("shift")}>
          <Select value={form.shift} onChange={set("shift")}>
            <option value="morning">{t("morningShift")}</option>
            <option value="evening">{t("eveningShift")}</option>
            <option value="night">{t("nightShift")}</option>
          </Select>
        </Field>
        <Field label={t("signature")}><Input value={form.signature} onChange={set("signature")} /></Field>
        <Field label={t("situation")}><Textarea value={form.situation} onChange={set("situation")} rows={2} /></Field>
        <Field label={t("background")}><Textarea value={form.background} onChange={set("background")} rows={2} /></Field>
        <Field label={t("assessment")}><Textarea value={form.assessment} onChange={set("assessment")} rows={2} /></Field>
        <Field label={t("recommendation")}><Textarea value={form.recommendation} onChange={set("recommendation")} rows={2} /></Field>
      </div>
      <Button onClick={add}><Plus />{t("add")}</Button>
      {!entries?.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <EntryTable head={[t("date"), t("shift"), t("situation"), t("assessment"), t("signature"), ""]}>
          {entries.map((s) => (
            <tr key={s.id}>
              <Td mono>{s.date}</Td>
              <Td>{t(s.shift === "morning" ? "morningShift" : s.shift === "evening" ? "eveningShift" : "nightShift")}</Td>
              <Td>{s.situation}</Td><Td>{s.assessment}</Td><Td>{s.signature}</Td>
              <Td><DeleteBtn onClick={() => db.sbar.delete(s.id!)} /></Td>
            </tr>
          ))}
        </EntryTable>
      )}
    </div>
  );
}

function CarePlanTab({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const entries = useLiveQuery(
    () => db.careplan.where("patientId").equals(patientId).sortBy("dateIdentified"),
    [patientId],
  );
  const [form, setForm] = useState({
    dateIdentified: today(), problemNo: "", problem: "", objective: "", intervention: "", dateResolved: "", nurseSign: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickStandard(no: string) {
    const sp = STANDARD_PROBLEMS.find((p) => String(p.no) === no);
    if (!sp) return;
    setForm((f) => ({ ...f, problemNo: String(sp.no), problem: sp.problem, objective: sp.objective, intervention: sp.intervention }));
  }

  async function add() {
    if (!form.problem.trim()) return;
    const entry: CarePlanEntry = { patientId, ...form };
    await db.careplan.add(entry);
    setForm((f) => ({ ...f, problemNo: "", problem: "", objective: "", intervention: "", dateResolved: "", nurseSign: "" }));
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("dateIdentified")}><Input type="date" value={form.dateIdentified} onChange={set("dateIdentified")} dir="ltr" /></Field>
        <Field label={t("problemNo")}><Input value={form.problemNo} onChange={set("problemNo")} dir="ltr" /></Field>
        <Field label={t("pickStandard")}>
          <Select value="" onChange={(e) => pickStandard(e.target.value)}>
            <option value="">—</option>
            {STANDARD_PROBLEMS.map((p) => (
              <option key={p.no} value={p.no}>{p.no}. {p.problem.slice(0, 60)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("problem")} className="sm:col-span-3"><Textarea value={form.problem} onChange={set("problem")} rows={2} /></Field>
        <Field label={t("objective")} className="sm:col-span-3 lg:col-span-1"><Textarea value={form.objective} onChange={set("objective")} rows={2} /></Field>
        <Field label={t("intervention")} className="sm:col-span-3 lg:col-span-1"><Textarea value={form.intervention} onChange={set("intervention")} rows={2} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("dateResolved")}><Input type="date" value={form.dateResolved} onChange={set("dateResolved")} dir="ltr" /></Field>
          <Field label={t("nurseSign")}><Input value={form.nurseSign} onChange={set("nurseSign")} /></Field>
        </div>
      </div>
      <Button onClick={add}><Plus />{t("add")}</Button>
      {!entries?.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <EntryTable head={[t("dateIdentified"), t("problemNo"), t("problem"), t("dateResolved"), t("nurseSign"), ""]}>
          {entries.map((c) => (
            <tr key={c.id}>
              <Td mono>{c.dateIdentified}</Td><Td mono>{c.problemNo}</Td>
              <Td><span className="line-clamp-2">{c.problem}</span></Td>
              <Td mono>{c.dateResolved}</Td><Td>{c.nurseSign}</Td>
              <Td><DeleteBtn onClick={() => db.careplan.delete(c.id!)} /></Td>
            </tr>
          ))}
        </EntryTable>
      )}
    </div>
  );
}
