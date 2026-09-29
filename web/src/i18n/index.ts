import serverTranslations from "./serverMessages.json";
import { english } from "./messages";

// Server diagnostics are translation data, separate from the lookup logic.
const serverEnglish: Readonly<Record<string, string>> = serverTranslations;

export type Language = "ru" | "en";
export const LANGUAGE_COOKIE = "live_life_language";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A saved choice wins; otherwise use the first supported browser preference. */
export function resolveLanguage(
  cookie: string,
  languages: readonly string[],
): Language {
  const saved = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`))
    ?.split("=")[1];
  if (saved === "ru" || saved === "en") return saved;
  for (const preference of languages) {
    const base = preference.toLowerCase().split(/[-_]/)[0];
    if (base === "ru" || base === "en") return base;
  }
  return "en";
}

let browserLanguages: readonly string[] = [];
if (typeof navigator !== "undefined") {
  if (navigator.languages?.length) {
    browserLanguages = navigator.languages;
  } else {
    browserLanguages = [navigator.language];
  }
}

// Initialize before configuration modules create labels and formatters. A language
// change reloads the current URL, keeping every module on the same locale.
export const language = resolveLanguage(
  typeof document === "undefined" ? "" : document.cookie,
  browserLanguages,
);
export const locale = language === "ru" ? "ru-RU" : "en-GB";

export function saveLanguage(value: Language): void {
  document.cookie = `${LANGUAGE_COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function t(
  message: keyof typeof english,
  ...values: (string | number)[]
): string {
  const translated = language === "en" ? english[message] : message;
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    values[Number(index)] === undefined
      ? placeholder
      : String(values[Number(index)]),
  );
}

/** Translate only application diagnostics, never task titles, notes, or source data. */
export function serverMessage(message: string): string {
  if (language === "ru") return message;
  if (Object.hasOwn(serverEnglish, message)) return serverEnglish[message];
  const missingToken =
    /^(Todoist|RescueTime) не обновлён: в настройках приложения нет токена доступа\.$/.exec(
      message,
    );
  if (missingToken)
    return `${missingToken[1]} was not updated: no access token is configured.`;
  const tokenStep =
    /^Добавьте токен (Todoist|RescueTime) в файл \.env и повторите импорт\.$/.exec(
      message,
    );
  if (tokenStep)
    return `Add the ${tokenStep[1]} token to .env and retry the import.`;
  const rescueFailure =
    /^RescueTime (временно не ответил|не удалось обновить)( \(HTTP \d+\))?\.( Автоматические повторные попытки не помогли\.)?$/.exec(
      message,
    );
  if (rescueFailure)
    return `RescueTime ${rescueFailure[1] === "временно не ответил" ? "temporarily did not respond" : "could not be updated"}${rescueFailure[2] ?? ""}.${rescueFailure[3] ? " Automatic retries did not help." : ""}`;
  return message;
}
