import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en";

const dict = {
  appName: { ar: "سجل مرضى جناح 39", en: "Ward 39 Patient Registry" },
  hospital: { ar: "مركز الكويت للصحة النفسية", en: "Kuwait Center for Mental Health" },
  patients: { ar: "المرضى", en: "Patients" },
  newPatient: { ar: "مريض جديد", en: "New Patient" },
  editPatient: { ar: "تعديل بيانات المريض", en: "Edit Patient" },
  search: { ar: "بحث بالاسم أو رقم الملف أو البطاقة المدنية…", en: "Search by name, file no. or civil ID…" },
  fileNo: { ar: "رقم الملف", en: "File No" },
  name: { ar: "الاسم", en: "Name" },
  nationality: { ar: "الجنسية", en: "Nationality" },
  diagnosis: { ar: "التشخيص", en: "Diagnosis" },
  folderNo: { ar: "رقم الفولدر", en: "Folder No" },
  age: { ar: "العمر", en: "Age" },
  doctor: { ar: "الطبيب المعالج", en: "Treating Doctor" },
  cid: { ar: "البطاقة المدنية", en: "Civil ID" },
  doa: { ar: "تاريخ الدخول", en: "Date of Admission" },
  dob: { ar: "تاريخ الميلاد", en: "Date of Birth" },
  sex: { ar: "الجنس", en: "Sex" },
  male: { ar: "ذكر", en: "Male" },
  female: { ar: "أنثى", en: "Female" },
  room: { ar: "الغرفة", en: "Room" },
  bed: { ar: "السرير", en: "Bed" },
  maritalStatus: { ar: "الحالة الاجتماعية", en: "Marital Status" },
  notes: { ar: "ملاحظات", en: "Notes" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  delete: { ar: "حذف", en: "Delete" },
  edit: { ar: "تعديل", en: "Edit" },
  back: { ar: "رجوع", en: "Back" },
  print: { ar: "طباعة", en: "Print" },
  actions: { ar: "إجراءات", en: "Actions" },
  confirmDelete: { ar: "هل أنت متأكد من حذف هذا المريض وكل سجلاته؟", en: "Delete this patient and all their records?" },
  savedOk: { ar: "تم الحفظ بنجاح", en: "Saved successfully" },
  deletedOk: { ar: "تم الحذف", en: "Deleted" },
  total: { ar: "إجمالي المرضى", en: "Total patients" },
  noResults: { ar: "لا توجد نتائج مطابقة", en: "No matching results" },
  loading: { ar: "جارٍ التحميل…", en: "Loading…" },
  importExcel: { ar: "استيراد من Excel", en: "Import Excel" },
  exportExcel: { ar: "تصدير Excel", en: "Export Excel" },
  backupJson: { ar: "نسخة احتياطية", en: "Backup" },
  restoreJson: { ar: "استعادة نسخة", en: "Restore" },
  importDone: { ar: "تم الاستيراد", en: "Import completed" },
  importFail: { ar: "فشل الاستيراد — تأكد من تنسيق الملف", en: "Import failed — check the file format" },
  backupDone: { ar: "تم تنزيل النسخة الاحتياطية", en: "Backup downloaded" },
  restoreDone: { ar: "تمت الاستعادة", en: "Restore completed" },
  restoreWarn: { ar: "الاستعادة ستحل محل كل البيانات الحالية. متابعة؟", en: "Restore will replace ALL current data. Continue?" },
  patientFile: { ar: "ملف المريض", en: "Patient File" },
  printForms: { ar: "نماذج الطباعة", en: "Print Forms" },
  patientData: { ar: "بيانات المريض", en: "Patient Data Sheet" },
  sbarForm: { ar: "نموذج SBAR", en: "SBAR Handover" },
  vitalsForm: { ar: "العلامات الحيوية", en: "Vital Signs" },
  notesForm: { ar: "ملاحظات التمريض", en: "Nurses Notes" },
  careplanForm: { ar: "خطة الرعاية", en: "Care Plan" },
  treatmentForm: { ar: "ورقة العلاج (MR 12)", en: "Treatment Sheet (MR 12)" },
  consultationForm: { ar: "تقرير استشاري (MR 9)", en: "Consultation Report (MR 9)" },
  progressForm: { ar: "تقدم الحالة (MR 8)", en: "Clinical Progress Notes (MR 8)" },
  nursingDbForm: { ar: "البيانات الأساسية (NURS 6A)", en: "Nursing Data Base (NURS 6A)" },
  vitals: { ar: "العلامات الحيوية", en: "Vital Signs" },
  nurseNotes: { ar: "ملاحظات التمريض", en: "Nurses Notes" },
  sbar: { ar: "SBAR", en: "SBAR" },
  careplan: { ar: "خطة الرعاية", en: "Care Plan" },
  add: { ar: "إضافة", en: "Add" },
  date: { ar: "التاريخ", en: "Date" },
  time: { ar: "الوقت", en: "Time" },
  bp: { ar: "الضغط", en: "BP" },
  pulse: { ar: "النبض", en: "Pulse" },
  resp: { ar: "التنفس", en: "Resp" },
  temp: { ar: "الحرارة", en: "Temp" },
  spo2: { ar: "الأكسجين", en: "SpO2" },
  weight: { ar: "الوزن", en: "Weight" },
  note: { ar: "الملاحظة", en: "Note" },
  shift: { ar: "الوردية", en: "Shift" },
  morningShift: { ar: "صباحية (7ص - 2م)", en: "Morning (07-14)" },
  eveningShift: { ar: "مسائية (2م - 10م)", en: "Evening (14-22)" },
  nightShift: { ar: "ليلية (10م - 7ص)", en: "Night (22-07)" },
  situation: { ar: "الحالة (Situation)", en: "Situation" },
  background: { ar: "الخلفية (Background)", en: "Background" },
  assessment: { ar: "التقييم (Assessment)", en: "Assessment" },
  recommendation: { ar: "التوصية (Recommendation)", en: "Recommendation" },
  signature: { ar: "التوقيع", en: "Signature" },
  problemNo: { ar: "رقم المشكلة", en: "Problem No" },
  problem: { ar: "المشكلة", en: "Problem" },
  objective: { ar: "الهدف المتوقع", en: "Objective / Outcome" },
  intervention: { ar: "التدخل التمريضي", en: "Nursing Intervention" },
  dateIdentified: { ar: "تاريخ التحديد", en: "Date Identified" },
  dateResolved: { ar: "تاريخ الحل", en: "Date Resolved" },
  nurseSign: { ar: "توقيع الممرض", en: "Nurse Sign" },
  standardProblems: { ar: "المشاكل النمطية", en: "Standard problems" },
  pickStandard: { ar: "اختيار من القائمة النمطية", en: "Pick from standard list" },
  noEntries: { ar: "لا توجد سجلات بعد", en: "No entries yet" },
  ward: { ar: "الجناح", en: "Ward" },
  required: { ar: "هذا الحقل مطلوب", en: "This field is required" },
  offlineReady: { ar: "يعمل بدون إنترنت — البيانات محفوظة على هذا الجهاز", en: "Works offline — data is stored on this device" },
  home: { ar: "الرئيسية", en: "Home" },
  addPt: { ar: "إضافة مريض", en: "Add Pt" },
  dischPt: { ar: "خروج مريض", en: "Discharge Pt" },
  rounds: { ar: "الراوند", en: "Round" },
  paperForm: { ar: "النماذج الورقية", en: "Paper Form" },
  tranq: { ar: "المهدئات الكبرى والمراقبة", en: "Major Tranquilizer & Control" },
  nurseAssignment: { ar: "توزيع التمريض", en: "Nurse Assignment" },
  ncp: { ar: "خطة الرعاية التمريضية", en: "Nursing Care Plan" },
  activePatients: { ar: "المرضى الحاليون", en: "Active patients" },
  discharged: { ar: "خرج من الجناح", en: "Discharged" },
  dischargedList: { ar: "المرضى الخارجون", en: "Discharged patients" },
  dischargeNote: { ar: "ملاحظة الخروج", en: "Discharge note" },
  confirmDischarge: { ar: "تأكيد خروج هذا المريض؟", en: "Discharge this patient?" },
  dischargeDone: { ar: "تم تسجيل الخروج", en: "Patient discharged" },
  undoDischarge: { ar: "إرجاع للجناح", en: "Readmit" },
  existingPatientFound: { ar: "المريض موجود مسبقاً — تم جلب بياناته", en: "Patient already exists — data loaded" },
  readmittedOk: { ar: "تم إدخال المريض للجناح من جديد", en: "Patient re-admitted to the ward" },
  patientAlreadyActive: { ar: "هذا المريض موجود حالياً في الجناح — تم تحديث بياناته", en: "Patient is already in the ward — data updated" },
  selectPatient: { ar: "اختر المريض", en: "Select patient" },
  findings: { ar: "الملاحظات الطبية", en: "Findings" },
  orders: { ar: "الأوامر الطبية", en: "Orders" },
  nurse: { ar: "الممرض/ة", en: "Nurse" },
  drug: { ar: "الدواء", en: "Drug" },
  dose: { ar: "الجرعة", en: "Dose" },
  route: { ar: "طريقة الإعطاء", en: "Route" },
  indication: { ar: "دواعي الاستعمال", en: "Indication" },
  givenBy: { ar: "أعطي بواسطة", en: "Given by" },
  effect: { ar: "الأثر / المراقبة", en: "Effect / Monitoring" },
  remarks: { ar: "ملاحظات", en: "Remarks" },
  today: { ar: "اليوم", en: "Today" },
  openFile: { ar: "فتح الملف", en: "Open file" },
  clear: { ar: "مسح", en: "Clear" },
} as const;

export type TKey = keyof typeof dict;

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
}>({ lang: "ar", setLang: () => {}, t: (k) => dict[k].ar });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = window.localStorage.getItem("ward39-lang");
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("ward39-lang", l);
  };

  const t = (k: TKey) => dict[k]?.[lang] ?? String(k);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
