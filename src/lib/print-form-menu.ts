/** Lightweight metadata for the paper-forms menu.
 * Keep this file free of print components/assets so the menu route can load independently.
 */
export const PRINT_FORM_MENU = [
  { key: "summary", ar: "بيانات المريض", en: "Patient Data Sheet" },
  { key: "sbar", ar: "نموذج SBAR", en: "Hand Over Sheet (SBAR)" },
  { key: "vitals", ar: "العلامات الحيوية", en: "Vital Signs" },
  { key: "careplan", ar: "خطة الرعاية", en: "Nursing Care Plan" },
  { key: "notes", ar: "ملاحظات التمريض", en: "Nurses Notes" },
  { key: "treatment", ar: "ورقة العلاج (MR 12)", en: "Treatment Sheet (MR 12)" },
  { key: "consultation", ar: "تقرير استشاري (MR 9)", en: "Consultation Report" },
  { key: "progress", ar: "تقدم الحالة (MR 8)", en: "Clinical Progress" },
  { key: "nursingdb", ar: "البيانات الأساسية (NURS 6A)", en: "Nursing Data Base (NURS 6A)" },
] as const;
