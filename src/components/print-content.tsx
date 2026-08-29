import { useLiveQuery } from "dexie-react-hooks";
import { db, type Patient, type SbarEntry, type VitalEntry } from "@/lib/db";
import { STANDARD_PROBLEMS } from "@/lib/careplan-standards";
import { BoxedDigits, makeField } from "@/components/OverlayPrint";
import { KcmhHeader, PatientHeaderGrid, PrintTitle } from "@/components/PrintSheet";
import logoKcmh from "@/assets/logo-kcmh.png.asset.json";
import logoMoh from "@/assets/logo-moh.png.asset.json";
import notesTemplate from "@/assets/nurses-notes-template.jpg.asset.json";
import treatmentTemplate from "@/assets/treatment-sheet-template.jpg.asset.json";
import consultationTemplate from "@/assets/consultation-report-template.jpg.asset.json";
import progressTemplate from "@/assets/progress-notes-template.jpg.asset.json";
import nursingDbTemplate from "@/assets/nursing-database-template.jpg.asset.json";

export type PrintFormKey =
  | "summary"
  | "sbar"
  | "vitals"
  | "notes"
  | "careplan"
  | "treatment"
  | "consultation"
  | "progress"
  | "nursingdb";

export interface PrintFormDef {
  key: PrintFormKey;
  ar: string;
  en: string;
  landscape?: boolean;
  /** Overlay forms print onto a pre-printed scanned template. */
  template?: string;
  Content: (props: { patient: Patient; id: number }) => React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Plain sheets                                                        */
/* ------------------------------------------------------------------ */

export function SummaryContent({ patient }: { patient: Patient }) {
  return (
    <>
      <KcmhHeader right="PATIENT DATA SHEET" />
      <PrintTitle>Patient Information</PrintTitle>
      <PatientHeaderGrid patient={patient} />
      {patient.notes ? (
        <div className="mb-6">
          <div className="text-sm font-bold">Notes:</div>
          <div className="mt-1 min-h-16 whitespace-pre-wrap border border-black p-2 text-sm">{patient.notes}</div>
        </div>
      ) : null}
      <div className="mt-16 flex justify-between text-sm">
        <div className="text-center">
          <div className="mb-1 border-t border-black px-8 pt-1">Nurse Signature</div>
        </div>
        <div className="text-center">
          <div className="mb-1 border-t border-black px-8 pt-1">Date</div>
        </div>
      </div>
    </>
  );
}

const VITAL_COLS = ["DATE", "TIME", "BP", "PULSE", "RESP", "TEMP", "SPO2"] as const;
const ROWS_PER_BLOCK = 14;

function VitalRow({ e }: { e: VitalEntry | undefined }) {
  return (
    <>
      <td className="h-6 border border-black px-1 py-1">{e?.date ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.time ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.bp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.pulse ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.resp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.temp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.spo2 ?? ""}</td>
    </>
  );
}

export function VitalsContent({ patient, id }: { patient: Patient; id: number }) {
  const entries = useLiveQuery(() => db.vitals.where("patientId").equals(id).sortBy("date"), [id]);
  const latest = (entries ?? []).slice(-ROWS_PER_BLOCK * 2);
  const left = latest.slice(0, ROWS_PER_BLOCK);
  const right = latest.slice(ROWS_PER_BLOCK);
  const lastWeight = [...(entries ?? [])].reverse().find((e) => e.weight)?.weight ?? "";

  return (
    <>
      <KcmhHeader right="VITAL SIGNS" />
      <table className="mb-2 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="px-1 py-1"><b>PATIENT'S NAME:</b> {patient.name}</td>
            <td className="px-1 py-1"><b>DOA:</b> {patient.doa || "—"}</td>
            <td className="px-1 py-1"><b>FILE NO:</b> {patient.fileNo || "—"}</td>
            <td className="px-1 py-1"><b>TR DOCTOR:</b> {patient.doctor || "—"}</td>
            <td className="px-1 py-1"><b>AGE:</b> {patient.age || "—"}</td>
            <td className="px-1 py-1"><b>SEX:</b> {patient.sex || "—"}</td>
          </tr>
        </tbody>
      </table>
      <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            {[...VITAL_COLS, ...VITAL_COLS].map((c, i) => (
              <th key={i} className="border border-black bg-neutral-100 px-1 py-1 text-[10px]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS_PER_BLOCK }, (_, r) => (
            <tr key={r}>
              <VitalRow e={left[r]} />
              <VitalRow e={right[r]} />
            </tr>
          ))}
          <tr>
            <td className="border border-black px-1 py-1 font-bold">DATE</td>
            <td colSpan={5} className="border border-black px-1 py-1"></td>
            <td className="border border-black px-1 py-1 font-bold">WEIGHT</td>
            <td className="border border-black px-1 py-1 font-bold">DATE</td>
            <td colSpan={5} className="border border-black px-1 py-1"></td>
            <td className="border border-black px-1 py-1 font-bold">WEIGHT</td>
          </tr>
          <tr>
            <td className="border border-black px-1 py-1">{left[0]?.date ?? ""}</td>
            <td colSpan={5} className="border border-black px-1 py-1"></td>
            <td className="border border-black px-1 py-1">{lastWeight}</td>
            <td className="border border-black px-1 py-1"></td>
            <td colSpan={5} className="border border-black px-1 py-1"></td>
            <td className="border border-black px-1 py-1"></td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export function CarePlanContent({ patient, id }: { patient: Patient; id: number }) {
  const entries = useLiveQuery(
    () => db.careplan.where("patientId").equals(id).sortBy("dateIdentified"),
    [id],
  );
  const list = entries ?? [];

  return (
    <>
      <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
        <div className="text-base font-bold">HOSPITAL: KCMH</div>
        <div className="text-sm font-bold">NURSING CARE PLAN — NURS.6 B</div>
        <div className="text-sm"><b>HOSPITAL NO:</b> {patient.fileNo}</div>
      </div>

      <table className="mb-2 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1"><b>Dept.</b> M</td>
            <td className="border border-black px-2 py-1"><b>Unit</b> 2</td>
            <td className="border border-black px-2 py-1"><b>Ward</b> 39</td>
            <td className="border border-black px-2 py-1"><b>Room</b> {patient.room || "—"}</td>
            <td className="border border-black px-2 py-1"><b>Bed</b> {patient.bed || "—"}</td>
            <td className="border border-black px-2 py-1" colSpan={2}><b>Diagnosis:</b> {patient.diagnosis || "—"}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1" colSpan={3}><b>NAME:</b> {patient.name}</td>
            <td className="border border-black px-2 py-1" colSpan={2}><b>C.I.D. NO:</b> {patient.cid || "—"}</td>
            <td className="border border-black px-2 py-1"><b>AGE:</b> {patient.age || "—"}</td>
            <td className="border border-black px-2 py-1"><b>SEX:</b> {patient.sex || "—"}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1" colSpan={3}><b>Doctor in Charge:</b> {patient.doctor || "—"}</td>
            <td className="border border-black px-2 py-1" colSpan={2}><b>Date of Adm:</b> {patient.doa || "—"}</td>
            <td className="border border-black px-2 py-1" colSpan={2}><b>Marital Status:</b> {patient.maritalStatus || "—"}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="w-[9%] border border-black bg-neutral-100 px-1 py-1">Date Pro. Identified</th>
            <th className="w-[5%] border border-black bg-neutral-100 px-1 py-1">Pro. No</th>
            <th className="w-[20%] border border-black bg-neutral-100 px-1 py-1">Patient's Problem Actual/Potential</th>
            <th className="w-[20%] border border-black bg-neutral-100 px-1 py-1">Objective (Expected Patient Outcome)</th>
            <th className="w-[24%] border border-black bg-neutral-100 px-1 py-1">Nursing Intervention</th>
            <th className="w-[9%] border border-black bg-neutral-100 px-1 py-1">Date Pro Resolved</th>
            <th className="w-[13%] border border-black bg-neutral-100 px-1 py-1">Nurse Sign</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td className="h-24 border border-black px-1 py-1" colSpan={7}></td>
            </tr>
          ) : (
            list.map((c) => (
              <tr key={c.id}>
                <td className="border border-black px-1 py-1 align-top">{c.dateIdentified}</td>
                <td className="border border-black px-1 py-1 align-top">{c.problemNo}</td>
                <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.problem}</td>
                <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.objective}</td>
                <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.intervention}</td>
                <td className="border border-black px-1 py-1 align-top">{c.dateResolved}</td>
                <td className="border border-black px-1 py-1 align-top">{c.nurseSign}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-3 flex gap-3 text-[10px]">
        <div className="flex-1">
          <p>(Specify potential problem with pt)</p>
          <p>Pro. = Problem &nbsp;|&nbsp; Rsvd. = Resolved</p>
          <p className="mt-2 font-bold">HEALTH TEACHING PLAN:-</p>
          <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
          <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
          <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
        </div>
        <div className="w-[38%]">
          <p className="mb-1 font-bold">Standard Problems Reference:</p>
          <ol className="list-decimal space-y-0.5 ps-4">
            {STANDARD_PROBLEMS.map((p) => (
              <li key={p.no}>{p.problem}</li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

const SHIFT_ROWS: Array<{ key: string; label: string }> = [
  { key: "morning", label: "07:AM\nTO\n02:PM" },
  { key: "evening", label: "02:PM\nTO\n10:PM" },
  { key: "night", label: "10:PM\nTO\n7:AM" },
];

function HCell({ label, value, width }: { label: string; value: string; width?: string }) {
  return (
    <td className="border border-black px-1 py-1 align-top" style={width ? { width } : undefined}>
      <span className="font-bold">{label} </span>
      <span>{value || "—"}</span>
    </td>
  );
}

function BCell({ children }: { children: string | undefined }) {
  return (
    <td className="border border-black px-1.5 py-1 align-top text-[11px] whitespace-pre-wrap">{children ?? ""}</td>
  );
}

export function SbarContent({ patient, id, date }: { patient: Patient; id: number; date: string }) {
  const all = useLiveQuery(() => db.sbar.where("patientId").equals(id).sortBy("date"), [id]);
  const entries = (all ?? []).filter((e) => e.date === date);
  const byShift = (shift: string): SbarEntry | undefined => entries.find((e) => e.shift === shift);

  return (
    <div className="border-2 border-black">
      <div className="flex items-center justify-between px-2 py-1">
        <img src={logoKcmh.url} alt="Kuwait Center for Mental Health" className="h-14 w-auto" />
        <h1 className="text-lg font-bold underline">Hand Over Sheet(SBAR)</h1>
        <img src={logoMoh.url} alt="Ministry of Health" className="h-14 w-auto" />
      </div>

      <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[7%] border border-black px-1 py-1 text-center align-middle font-bold">
              DATE
              <div className="font-normal">{date}</div>
            </td>
            <HCell label="Name:" value={patient.name} width="22%" />
            <HCell label="FILE#" value={patient.fileNo} width="17%" />
            <HCell label="DOB/AGE:" value={[patient.dob, patient.age].filter(Boolean).join(" / ")} width="19%" />
            <td className="w-[27%] border border-black px-1 py-1 text-center font-bold">Diagnosis</td>
            <td rowSpan={2} className="w-[8%] border border-black px-1 py-1 text-center align-middle font-bold">
              Ward:39
            </td>
          </tr>
          <tr>
            <HCell label="CID" value={patient.cid} />
            <HCell label="D.O.A:" value={patient.doa} />
            <HCell label="Nationality" value={patient.nationality} />
            <td className="border border-black px-1 py-1 text-center font-bold">
              {patient.diagnosis?.toUpperCase() || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="w-[7%] border border-black px-1 py-0.5">Shift</th>
            <th className="w-[21%] border border-black px-1 py-0.5">Situation</th>
            <th className="w-[18%] border border-black px-1 py-0.5">Background</th>
            <th className="w-[21%] border border-black px-1 py-0.5">Assessment</th>
            <th className="w-[24%] border border-black px-1 py-0.5">Recommendation</th>
            <th className="w-[9%] border border-black px-1 py-0.5">Signature</th>
          </tr>
        </thead>
        <tbody>
          {SHIFT_ROWS.map(({ key, label }) => {
            const e = byShift(key);
            return (
              <tr key={key}>
                <td className="h-[52mm] border border-black px-1 py-1 text-center align-middle text-[11px] font-bold whitespace-pre-line">
                  {label}
                </td>
                <BCell>{e?.situation}</BCell>
                <BCell>{e?.background}</BCell>
                <BCell>{e?.assessment}</BCell>
                <BCell>{e?.recommendation}</BCell>
                <BCell>{e?.signature}</BCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SbarSheet({ patient, id }: { patient: Patient; id: number }) {
  const today = new Date().toISOString().slice(0, 10);
  return <SbarContent patient={patient} id={id} date={today} />;
}

/* ------------------------------------------------------------------ */
/* Overlay sheets (data printed onto pre-printed MOH forms)            */
/* ------------------------------------------------------------------ */

const NOTES_IW = 1343;
const NOTES_IH = 1920;
const NF = makeField(NOTES_IW, NOTES_IH);
const NOTES_ROW_TOP = 400;
const NOTES_ROW_H = 47.2;
const NOTES_ROWS = 29;
const NOTES_COL = { date: 240, time: 388, notes: 515, sign: 1112 };

export function NotesContent({ patient, id }: { patient: Patient; id: number }) {
  const entries = useLiveQuery(() => db.notes.where("patientId").equals(id).sortBy("date"), [id]);
  const list = (entries ?? []).slice(-NOTES_ROWS);
  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");
  return (
    <>
      <NF left={400} top={90} width={330}>KCMH</NF>
      <BoxedDigits value={fileNo} cells={6} left={903} width={288} top={76} iw={NOTES_IW} ih={NOTES_IH} />

      <NF left={258} top={172} width={78} align="center">M</NF>
      <NF left={355} top={172} width={78} align="center">4</NF>
      <NF left={452} top={172} width={78} align="center">39</NF>
      <NF left={548} top={172} width={78} align="center">{patient.room}</NF>
      <NF left={645} top={172} width={78} align="center">{patient.bed}</NF>

      <NF left={862} top={166} width={378} size={14}>{patient.name}</NF>
      <NF left={866} top={220} width={370} size={14} spacing={17.5}>{cid}</NF>

      <NF left={262} top={266} width={170} align="center">{patient.doa}</NF>
      <NF left={488} top={266} width={236} align="center" size={11}>{patient.doctor}</NF>

      <NF left={880} top={278} width={120}>{patient.sex}</NF>
      <NF left={1085} top={278} width={150}>{patient.age}</NF>
      <NF left={905} top={315} width={335} size={12}>{patient.diagnosis}</NF>

      {list.map((n, i) => {
        const top = NOTES_ROW_TOP + i * NOTES_ROW_H + 8;
        return (
          <div key={n.id}>
            <NF left={NOTES_COL.date} top={top} width={NOTES_COL.time - NOTES_COL.date} align="center" size={12}>
              {n.date}
            </NF>
            <NF left={NOTES_COL.time} top={top} width={NOTES_COL.notes - NOTES_COL.time} align="center" size={12}>
              {n.time}
            </NF>
            <NF left={NOTES_COL.notes + 8} top={top} width={NOTES_COL.sign - NOTES_COL.notes - 16} size={12}>
              {n.note}
            </NF>
          </div>
        );
      })}
    </>
  );
}

const TR_IW = 1172;
const TR_IH = 1676;
const TF = makeField(TR_IW, TR_IH);
const TR_ROW_TOP = 412;
const TR_ROW_H = 38.6;
const TR_ROWS = 30;

export function TreatmentContent({ patient, id }: { patient: Patient; id: number }) {
  const entries = useLiveQuery(() => db.tranq.where("patientId").equals(id).sortBy("date"), [id]);
  const list = (entries ?? []).slice(-TR_ROWS);
  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");
  return (
    <>
      <TF left={300} top={88} width={280}>KCMH</TF>
      <BoxedDigits value={fileNo} cells={6} left={740} width={325} top={90} iw={TR_IW} ih={TR_IH} />

      <TF left={190} top={158} width={72} align="center">M</TF>
      <TF left={273} top={158} width={72} align="center">4</TF>
      <TF left={350} top={158} width={72} align="center">39</TF>
      <TF left={432} top={158} width={65} align="center">{patient.room}</TF>
      <TF left={517} top={158} width={55} align="center">{patient.bed}</TF>

      <TF left={705} top={158} width={330} size={14}>{patient.name}</TF>
      <BoxedDigits value={cid} cells={12} left={708} width={332} top={205} iw={TR_IW} ih={TR_IH} size={12} />

      <TF left={735} top={248} width={70}>{patient.sex}</TF>
      <TF left={900} top={248} width={130}>{patient.age}</TF>

      <TF left={190} top={248} width={140} align="center" size={12}>{patient.doa}</TF>
      <TF left={380} top={248} width={205} align="center" size={11}>{patient.doctor}</TF>

      <TF left={310} top={312} width={730} size={12}>{patient.diagnosis}</TF>

      {list.map((e, i) => {
        const top = TR_ROW_TOP + i * TR_ROW_H + 7;
        return (
          <div key={e.id}>
            <TF left={178} top={top} width={116} align="center" size={11}>
              {[e.date, e.time].filter(Boolean).join(" ")}
            </TF>
            <TF left={306} top={top} width={478} size={11}>
              {[e.drug, e.dose, e.route, e.indication].filter(Boolean).join(" — ")}
            </TF>
            <TF left={798} top={top} width={308} size={11}>
              {e.effect}
            </TF>
          </div>
        );
      })}
    </>
  );
}

const CO_IW = 1196;
const CO_IH = 1692;
const CF = makeField(CO_IW, CO_IH);

export function ConsultationContent({ patient }: { patient: Patient }) {
  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");
  return (
    <>
      <CF left={330} top={52} width={280}>KCMH</CF>
      <BoxedDigits value={fileNo} cells={6} left={845} width={245} top={52} iw={CO_IW} ih={CO_IH} />

      <CF left={195} top={142} width={70} align="center">M</CF>
      <CF left={275} top={142} width={70} align="center">4</CF>
      <CF left={385} top={142} width={70} align="center">39</CF>
      <CF left={475} top={142} width={70} align="center">{patient.room}</CF>
      <CF left={562} top={142} width={70} align="center">{patient.bed}</CF>

      <CF left={745} top={148} width={340} size={14}>{patient.name}</CF>
      <BoxedDigits value={cid} cells={12} left={730} width={358} top={192} iw={CO_IW} ih={CO_IH} size={12} />

      <CF left={745} top={250} width={70}>{patient.sex}</CF>
      <CF left={925} top={250} width={130}>{patient.age}</CF>

      <CF left={195} top={240} width={140} align="center" size={12}>{patient.doa}</CF>
      <CF left={395} top={240} width={210} align="center" size={11}>{patient.doctor}</CF>

      <CF left={400} top={318} width={700} size={12}>{patient.diagnosis}</CF>
    </>
  );
}

const PR_IW = 1112;
const PR_IH = 1576;
const PF = makeField(PR_IW, PR_IH);
const PR_ROW_TOP = 425;
const PR_ROW_H = 38.7;
const PR_ROWS = 28;

export function ProgressContent({ patient, id }: { patient: Patient; id: number }) {
  const entries = useLiveQuery(() => db.rounds.where("patientId").equals(id).sortBy("date"), [id]);
  const list = (entries ?? []).slice(-PR_ROWS);
  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");
  return (
    <>
      <PF left={295} top={52} width={250}>KCMH</PF>
      <BoxedDigits value={fileNo} cells={6} left={700} width={300} top={50} iw={PR_IW} ih={PR_IH} />

      <PF left={175} top={138} width={65} align="center">M</PF>
      <PF left={245} top={138} width={65} align="center">4</PF>
      <PF left={320} top={138} width={65} align="center">39</PF>
      <PF left={395} top={138} width={65} align="center">{patient.room}</PF>
      <PF left={470} top={138} width={60} align="center">{patient.bed}</PF>

      <PF left={655} top={128} width={330} size={14}>{patient.name}</PF>
      <BoxedDigits value={cid} cells={12} left={662} width={325} top={168} iw={PR_IW} ih={PR_IH} size={12} />

      <PF left={645} top={222} width={70}>{patient.sex}</PF>
      <PF left={850} top={222} width={130}>{patient.age}</PF>

      <PF left={175} top={212} width={135} align="center" size={12}>{patient.doa}</PF>
      <PF left={330} top={212} width={205} align="center" size={11}>{patient.doctor}</PF>

      <PF left={310} top={305} width={720} size={12}>{patient.diagnosis}</PF>

      {list.map((r, i) => {
        const top = PR_ROW_TOP + i * PR_ROW_H + 7;
        return (
          <div key={r.id}>
            <PF left={170} top={top} width={145} align="center" size={11}>
              {r.date}
            </PF>
            <PF left={330} top={top} width={725} size={11}>
              {[r.findings, r.orders, r.doctor].filter(Boolean).join(" — ")}
            </PF>
          </div>
        );
      })}
    </>
  );
}

const ND_IW = 1352;
const ND_IH = 1920;
const DF = makeField(ND_IW, ND_IH);

export function NursingDbContent({ patient, id }: { patient: Patient; id: number }) {
  const vitals = useLiveQuery(() => db.vitals.where("patientId").equals(id).sortBy("date"), [id]);
  const last = (vitals ?? []).at(-1);
  const cid = (patient.cid || "").replace(/\D/g, "");
  const fileNo = (patient.fileNo || "").replace(/\D/g, "");
  return (
    <>
      <DF left={380} top={58} width={330}>KCMH</DF>
      <BoxedDigits value={fileNo} cells={6} left={908} width={322} top={58} iw={ND_IW} ih={ND_IH} />

      <DF left={237} top={140} width={65} align="center">M</DF>
      <DF left={328} top={140} width={65} align="center">4</DF>
      <DF left={415} top={140} width={65} align="center">39</DF>
      <DF left={500} top={140} width={65} align="center">{patient.room}</DF>
      <DF left={587} top={140} width={70} align="center">{patient.bed}</DF>

      <DF left={868} top={162} width={385} size={14}>{patient.name}</DF>
      <BoxedDigits value={cid} cells={12} left={852} width={363} top={205} iw={ND_IW} ih={ND_IH} size={12} />

      <DF left={855} top={258} width={70}>{patient.sex}</DF>
      <DF left={1045} top={258} width={150}>{patient.age}</DF>

      <DF left={237} top={240} width={165} align="center" size={12}>{patient.doa}</DF>
      <DF left={430} top={240} width={330} align="center" size={11}>{patient.doctor}</DF>

      <DF left={355} top={310} width={300} size={12}>{patient.nationality}</DF>
      <DF left={355} top={352} width={300} size={12}>{patient.maritalStatus}</DF>

      {last ? (
        <>
          <DF left={548} top={1118} width={140} size={12}>{last.temp}</DF>
          <DF left={740} top={1118} width={200} size={12}>{last.pulse}</DF>
          <DF left={1015} top={1140} width={200} size={12}>{last.resp}</DF>
          <DF left={548} top={1158} width={180} size={12}>{last.bp}</DF>
          <DF left={790} top={1158} width={160} size={12}>{last.weight}</DF>
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Registry used by single-patient and batch printing                  */
/* ------------------------------------------------------------------ */

export const PRINT_FORMS: PrintFormDef[] = [
  { key: "summary", ar: "بيانات المريض", en: "Patient Data Sheet", Content: SummaryContent },
  { key: "sbar", ar: "نموذج SBAR", en: "Hand Over Sheet (SBAR)", landscape: true, Content: SbarSheet },
  { key: "vitals", ar: "العلامات الحيوية", en: "Vital Signs", Content: VitalsContent },
  { key: "careplan", ar: "خطة الرعاية", en: "Nursing Care Plan", Content: CarePlanContent },
  { key: "notes", ar: "ملاحظات التمريض", en: "Nurses Notes", template: notesTemplate.url, Content: NotesContent },
  { key: "treatment", ar: "ورقة العلاج (MR 12)", en: "Treatment Sheet (MR 12)", template: treatmentTemplate.url, Content: TreatmentContent },
  { key: "consultation", ar: "تقرير استشاري (MR 9)", en: "Consultation Report (MR 9)", template: consultationTemplate.url, Content: ConsultationContent },
  { key: "progress", ar: "تقدم الحالة (MR 8)", en: "Clinical Progress (MR 8)", template: progressTemplate.url, Content: ProgressContent },
  { key: "nursingdb", ar: "البيانات الأساسية (NURS 6A)", en: "Nursing Data Base (NURS 6A)", template: nursingDbTemplate.url, Content: NursingDbContent },
];

export function getPrintForm(key: string): PrintFormDef | undefined {
  return PRINT_FORMS.find((f) => f.key === key);
}
