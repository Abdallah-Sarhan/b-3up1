import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UserPlus,
  LogOut,
  Stethoscope,
  Printer,
  Pill,
  Users,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "جناح 39 — الواجهة الرئيسية | Ward 39 Home" },
      {
        name: "description",
        content:
          "Ward 39 main menu: add patient, discharge, round, paper forms, major tranquilizer control, nurse assignment and nursing care plan.",
      },
      { property: "og:title", content: "Ward 39 — Main Menu" },
      {
        property: "og:description",
        content:
          "Offline Ward 39 hub: admissions, discharges, rounds, forms, tranquilizer control, nurse assignment and care plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t } = useLang();
  const patients = useActivePatients();

  const tiles = [
    { to: "/handover", icon: LayoutDashboard, label: t("handover"), tone: "plain" },
    { to: "/patients/new", icon: UserPlus, label: t("addPt"), tone: "primary" },
    { to: "/discharge", icon: LogOut, label: t("dischPt"), tone: "plain" },
    { to: "/rounds", icon: Stethoscope, label: t("rounds"), tone: "plain" },
    { to: "/paper-forms", icon: Printer, label: t("paperForm"), tone: "plain" },
    { to: "/tranquilizer", icon: Pill, label: t("tranq"), tone: "plain" },
    { to: "/assignment", icon: Users, label: t("nurseAssignment"), tone: "plain" },
    { to: "/ncp", icon: ClipboardList, label: t("ncp"), tone: "plain" },
  ] as const;

  return (
    <div className="space-y-8 py-4">
      <div className="text-center">
        <h1 className="inline-block rounded-xl border-2 border-primary px-8 py-3 text-3xl font-extrabold tracking-wide text-primary">
          WARD 39
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("activePatients")}: {patients?.length ?? "…"}
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className={
              "flex items-center gap-4 rounded-xl border-2 px-5 py-6 text-lg font-semibold shadow-sm transition-colors " +
              (tile.tone === "primary"
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border bg-card text-card-foreground hover:border-primary hover:bg-accent")
            }
          >
            <tile.icon className="size-6 shrink-0" />
            <span>{tile.label}</span>
          </Link>
        ))}
        <Link
          to="/patients"
          className="flex items-center gap-4 rounded-xl border-2 border-dashed border-border bg-card px-5 py-6 text-lg font-semibold text-card-foreground shadow-sm transition-colors hover:border-primary hover:bg-accent"
        >
          <Users className="size-6 shrink-0" />
          <span>{t("patients")}</span>
        </Link>
      </div>
    </div>
  );
}
