import type { ComponentType } from "react";
import {
  Armchair,
  BookOpen,
  CircleEllipsis,
  Code,
  Footprints,
  Home,
  MessageCircle,
  Plane,
  Smartphone,
  Tv,
  Utensils,
  type LucideProps,
} from "lucide-react";

export type EmaActivityConfig = {
  code: string;
  label: string;
  icon: ComponentType<LucideProps>;
};

export const EMA_ACTIVITIES: Record<string, EmaActivityConfig> = {
  work_coding: {
    code: "work_coding",
    label: "Work / coding",
    icon: Code,
  },
  learning_reading: {
    code: "learning_reading",
    label: "Learning / reading",
    icon: BookOpen,
  },
  communication_social: {
    code: "communication_social",
    label: "Communication / social",
    icon: MessageCircle,
  },
  entertainment: {
    code: "entertainment",
    label: "Entertainment",
    icon: Tv,
  },
  social_media_browsing: {
    code: "social_media_browsing",
    label: "Social media / browsing",
    icon: Smartphone,
  },
  exercise_walking: {
    code: "exercise_walking",
    label: "Exercise / walking",
    icon: Footprints,
  },
  eating: {
    code: "eating",
    label: "Eating",
    icon: Utensils,
  },
  resting: {
    code: "resting",
    label: "Resting",
    icon: Armchair,
  },
  household_errands: {
    code: "household_errands",
    label: "Household / errands",
    icon: Home,
  },
  traveling: {
    code: "traveling",
    label: "Traveling",
    icon: Plane,
  },
  other: {
    code: "other",
    label: "Other",
    icon: CircleEllipsis,
  },
};

export function getEmaActivity(activity?: string | null): EmaActivityConfig {
  if (activity && Object.hasOwn(EMA_ACTIVITIES, activity)) {
    return EMA_ACTIVITIES[activity];
  }
  if (!activity) {
    return {
      code: "other",
      label: "Other",
      icon: CircleEllipsis,
    };
  }
  return {
    code: activity,
    label: activity.replaceAll("_", " "),
    icon: CircleEllipsis,
  };
}
