import { t } from "../i18n";
export const SYNC_SOURCES = [
  { key: "bracelet", label: t("Браслет") },
  { key: "welltory", label: "Welltory" },
  { key: "rescuetime", label: "RescueTime" },
  { key: "todoist", label: "Todoist" },
] as const;
export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SYNC_SOURCES.map(({ key, label }) => [key, label]),
);
export const SYNC_STATUS_LABELS = {
  success: t("обновлено"),
  failed: t("ошибка"),
  not_run: t("недоступен"),
  partial: t("обновлено частично"),
};
export const JSON_HEADERS = { "Content-Type": "application/json" };
