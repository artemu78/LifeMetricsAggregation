import { t, locale } from "../i18n";
import { ChartNoAxesCombined, HeartPulse, ListTodo, Watch } from "lucide-react";
import { SOURCE_LABELS } from "../shared/sourceConfig";

export const WEEKDAYS = [
  t("Пн"),
  t("Вт"),
  t("Ср"),
  t("Чт"),
  t("Пт"),
  t("Сб"),
  t("Вс"),
];
export const MONTH_FORMAT = new Intl.DateTimeFormat(locale, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const QUALITY: Record<string, string> = {
  complete: t("Все источники обновлены"),
  partial: t(
    "Есть частичные или исторические данные без подтверждённого запуска",
  ),
  failed: t("Один или несколько источников завершились ошибкой"),
  not_run: t("Сбор данных не запускался"),
  in_progress: t("Текущий логический день ещё продолжается"),
};
export const SOURCE_ICONS = [
  {
    key: "bracelet",
    name: SOURCE_LABELS.bracelet,
    description: t("Сон, шаги и другие измерения браслета"),
    Icon: Watch,
  },
  {
    key: "welltory",
    name: SOURCE_LABELS.welltory,
    description: t("Измерения Welltory"),
    Icon: HeartPulse,
  },
  {
    key: "todoist",
    name: SOURCE_LABELS.todoist,
    description: t("Созданные и завершённые задачи"),
    Icon: ListTodo,
  },
  {
    key: "rescuetime",
    name: SOURCE_LABELS.rescuetime,
    description: t("Активность и продуктивность"),
    Icon: ChartNoAxesCombined,
  },
] as const;
