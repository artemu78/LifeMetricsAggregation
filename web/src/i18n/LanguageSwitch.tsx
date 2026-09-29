import { language, saveLanguage, type Language } from "./index";

export function LanguageSwitch({
  disabled = false,
}: Readonly<{ disabled?: boolean }>) {
  return (
    <select
      className="language-switch"
      aria-label={language === "en" ? "Interface language" : "Язык интерфейса"}
      value={language}
      disabled={disabled}
      onChange={(event) => {
        saveLanguage(event.target.value as Language);
        window.location.reload();
      }}
    >
      <option value="ru" lang="ru">
        Русский
      </option>
      <option value="en" lang="en">
        English
      </option>
    </select>
  );
}
