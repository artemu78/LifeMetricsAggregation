import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_COOKIE, resolveLanguage, saveLanguage } from "../src/i18n";
import { english } from "../src/i18n/messages";

afterEach(() => {
  document.cookie = `${LANGUAGE_COOKIE}=; Max-Age=0; Path=/`;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("language selection", () => {
  it.each([
    ["", ["en-US"], "en"],
    ["", ["ru-RU", "en"], "ru"],
    ["", ["de-DE", "ru", "en"], "ru"],
    ["", ["EN-gb", "ru"], "en"],
    ["", ["fr-FR"], "en"],
    ["", [], "en"],
    [`other=en; ${LANGUAGE_COOKIE}=ru`, ["en-US"], "ru"],
    [`${LANGUAGE_COOKIE}=en`, ["ru-RU"], "en"],
    [`${LANGUAGE_COOKIE}=invalid`, ["ru"], "ru"],
    [`${LANGUAGE_COOKIE}=%invalid`, ["en"], "en"],
    [`prefix_${LANGUAGE_COOKIE}=en`, ["ru"], "ru"],
  ])(
    "resolves cookie %s and browser preferences %j to %s",
    (cookie, preferences, expected) => {
      expect(resolveLanguage(cookie, preferences)).toBe(expected);
    },
  );

  it("persists the selected language without changing unrelated cookies", () => {
    document.cookie = "unrelated=keep; Path=/";
    saveLanguage("en");
    expect(resolveLanguage(document.cookie, ["ru"])).toBe("en");
    expect(document.cookie).toContain("unrelated=keep");
    saveLanguage("ru");
    expect(resolveLanguage(document.cookie, ["en"])).toBe("ru");
    document.cookie = "unrelated=; Max-Age=0; Path=/";
  });
});

it("keeps the same interpolation placeholders in every translation", () => {
  for (const [russian, translated] of Object.entries(english)) {
    expect(translated.trim(), russian).not.toBe("");
    expect(translated.match(/\{\d+\}/g) ?? [], russian).toEqual(
      russian.match(/\{\d+\}/g) ?? [],
    );
  }
});

it("formats English durations and translates server diagnostics without changing source text", async () => {
  saveLanguage("en");
  vi.resetModules();
  const { t, locale, serverMessage } = await import("../src/i18n");
  const { formatDuration } = await import("../src/shared/formatDuration");
  expect(locale).toBe("en-GB");
  expect(formatDuration(3660)).toBe("1 h 1 min");
  expect(t("Задача {0} · {1}", "created", "Моя задача {0}")).toBe(
    "Task created · Моя задача {0}",
  );
  expect(t("Ошибка {0}")).toBe("Error {0}");
  expect(serverMessage("нет записей")).toBe("no records");
  expect(
    serverMessage(
      "RescueTime временно не ответил (HTTP 503). Автоматические повторные попытки не помогли.",
    ),
  ).toBe(
    "RescueTime temporarily did not respond (HTTP 503). Automatic retries did not help.",
  );
  expect(serverMessage("RescueTime не удалось обновить.")).toBe(
    "RescueTime could not be updated.",
  );
  expect(
    serverMessage(
      "Todoist не обновлён: в настройках приложения нет токена доступа.",
    ),
  ).toContain("no access token");
  expect(
    serverMessage("Добавьте токен Todoist в файл .env и повторите импорт."),
  ).toBe("Add the Todoist token to .env and retry the import.");
  expect(serverMessage("Неизвестное сообщение")).toBe("Неизвестное сообщение");
});

it("keeps Russian messages and formatting when Russian is selected", async () => {
  saveLanguage("ru");
  vi.resetModules();
  const { t, locale, serverMessage } = await import("../src/i18n");
  expect(locale).toBe("ru-RU");
  expect(t("Ошибка {0}", 500)).toBe("Ошибка 500");
  expect(serverMessage("нет записей")).toBe("нет записей");
});
