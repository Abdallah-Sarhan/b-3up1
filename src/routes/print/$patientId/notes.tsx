import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";
import { usePrintPatient } from "@/components/PrintSheet";
import template from "@/assets/nurses-notes-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/notes")({
  head: () => ({
    meta: [
      { title: "Nurses Notes — Ward 39" },
      { name: "description", content: "Overlay printing of nurses notes data onto the official MOH NURS.1 form." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotesPrint,
});

// Reference scan geometry (px) -> percentage of the A4 sheet.
const IW = 1343;
const IH = 1920;
const x = (px: number) => `${(px / IW) * 100}%`;
const y = (px: number) => `${(px / IH) * 100}%`;

const ROW_TOP = 400;
const ROW_H = 47.2;
const ROWS = 29;

const COL = {
  date: 240,
  time: 388,
  notes: 515,
  sign: 1112,
  end: 1250,
};

function Field({
  left,
  top,
  width,
  children,
  align = "left",
  size = 13,
}: {
  left: number;
  top: number;
  width: number;
  children: React.ReactNode;
  align?: "left" | "center";
  size?: number;
}) {
  return (
    <div
      className="absolute overflow-hidden leading-tight"
      style={{
        left: x(left),
        top: y(top),
        width: x(width),
        textAlign: align,
        fontSize: `${size}px`,
        letterSpacing: "0.2px",
      }}
    >
      {children}
    </div>
  );
}

function NotesPrint() {
  const { id, patient } = usePrintPatient();
  const { t } = useLang();
  const { patientId } = useParams({ strict: false }) as { patientId: string };
  const [guide, setGuide] = useState(true);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

  const entries = useLiveQuery(
    () => db.notes.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const list = (entries ?? []).slice(-ROWS);

  if (patient === undefined) {
    return <p className="p-10 text-center text-muted-foreground">{t("loading")}</p>;
  }
  if (!patient) {
    return (
      <p className="p-10 text-center">
        <Link to="/" className="text-primary underline">← {t("back")}</Link>
      </p>
    );
  }

  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Link to="/patients/$patientId" params={{ patientId }}>
          <Button variant="outline" size="sm">
            <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
            {t("back")}
          </Button>
        </Link>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
          عرض النموذج كخلفية (لا يُطبع)
        </label>
        <label className="flex items-center gap-1 text-sm">
          إزاحة أفقي (mm)
          <input
            type="number"
            step="0.5"
            value={dx}
            onChange={(e) => setDx(Number(e.target.value))}
            className="h-8 w-16 rounded-md border border-input px-1"
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          إزاحة رأسي (mm)
          <input
            type="number"
            step="0.5"
            value={dy}
            onChange={(e) => setDy(Number(e.target.value))}
            className="h-8 w-16 rounded-md border border-input px-1"
          />
        </label>
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
      </div>

      <div
        dir="ltr"
        className="relative mx-auto bg-white text-black shadow-md print:shadow-none"
        style={{ width: "210mm", height: "297mm", fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {guide ? (
          <img
            src={template.url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-fill opacity-30 print:hidden"
          />
        ) : null}

        <div
          className="absolute inset-0"
          style={{ transform: `translate(${dx}mm, ${dy}mm)` }}
        >
          {/* Header */}
          <Field left={400} top={90} width={330}>KCMH</Field>
          {HOSP_CELLS.map((cx, i) => {
            const digits = fileNo.slice(-6).padStart(6, " ");
            return (
              <Field key={i} left={cx} top={76} width={41} align="center" size={15}>
                {digits[i]?.trim() ?? ""}
              </Field>
            );
          })}


          <Field left={258} top={172} width={78} align="center">M</Field>
          <Field left={355} top={172} width={78} align="center">4</Field>
          <Field left={452} top={172} width={78} align="center">39</Field>
          <Field left={548} top={172} width={78} align="center">{patient.room}</Field>
          <Field left={645} top={172} width={78} align="center">{patient.bed}</Field>

          <Field left={862} top={166} width={378} size={14}>{patient.name}</Field>

          <Field left={866} top={220} width={370} size={14}>
            <span style={{ letterSpacing: "17.5px" }}>{cid}</span>
          </Field>

          <Field left={262} top={266} width={170} align="center">{patient.doa}</Field>
          <Field left={488} top={262} width={236} align="center">{patient.doctor}</Field>

          <Field left={880} top={278} width={120}>{patient.sex}</Field>
          <Field left={1085} top={278} width={150}>{patient.age}</Field>
          <Field left={905} top={315} width={335} size={12}>{patient.diagnosis}</Field>

          {/* Rows */}
          {list.map((n, i) => {
            const top = ROW_TOP + i * ROW_H + 8;
            return (
              <div key={n.id}>
                <Field left={COL.date} top={top} width={COL.time - COL.date} align="center" size={12}>
                  {n.date}
                </Field>
                <Field left={COL.time} top={top} width={COL.notes - COL.time} align="center" size={12}>
                  {n.time}
                </Field>
                <Field left={COL.notes + 8} top={top} width={COL.sign - COL.notes - 16} size={12}>
                  {n.note}
                </Field>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
