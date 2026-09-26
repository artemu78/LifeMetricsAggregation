import { ChartNoAxesCombined, HeartPulse, ListTodo, Watch } from "lucide-react";
import { SOURCE_LABELS } from "../shared/sourceConfig";

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const QUALITY: Record<string, string> = {
  complete: "Все источники обновлены",
  partial: "Есть частичные или исторические данные без подтверждённого запуска",
  failed: "Один или несколько источников завершились ошибкой",
  not_run: "Сбор данных не запускался",
  in_progress: "Текущий логический день ещё продолжается",
};
export const SOURCE_ICONS = [
  {
    key: "bracelet",
    name: SOURCE_LABELS.bracelet,
    description: "Сон, шаги и другие измерения браслета",
    Icon: Watch,
  },
  {
    key: "welltory",
    name: SOURCE_LABELS.welltory,
    description: "Измерения Welltory",
    Icon: HeartPulse,
  },
  {
    key: "todoist",
    name: SOURCE_LABELS.todoist,
    description: "Созданные и завершённые задачи",
    Icon: ListTodo,
  },
  {
    key: "rescuetime",
    name: SOURCE_LABELS.rescuetime,
    description: "Активность и продуктивность",
    Icon: ChartNoAxesCombined,
  },
] as const;
