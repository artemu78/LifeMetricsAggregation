import { expect, test } from "@playwright/test";

const snapshot = {
  from: "2026-09-24",
  to: "2026-09-24",
  timezone: "Europe/Moscow",
  generatedAt: "2026-09-25T06:00:00Z",
  days: [
    {
      date: "2026-09-24",
      weekday: 4,
      currentDay: false,
      quality: "complete",
      sources: ["bracelet", "welltory", "todoist", "rescuetime"].map(
        (source) => ({ source, status: "success" }),
      ),
      bracelet: { sleepSeconds: 25200, steps: 8420 },
      welltory: { available: false, count: 0 },
      todoist: { created: 1, completed: 0, deleted: 0 },
      rescuetime: { available: false, count: 0 },
      detail: {
        braceletMetrics: [],
        welltoryMetrics: [],
        createdTasks: [
          { content: "Моя задача", timestamp: "2026-09-24T10:00:00+03:00" },
        ],
        completedTasks: [],
        deletedTasks: [],
        emaEvents: [],
        rescueTime: [],
      },
    },
  ],
};

test.beforeEach(async ({ context }) => {
  await context.route("**/api/dashboard?**", (route) =>
    route.fulfill({ json: snapshot }),
  );
});

test.describe("English browser", () => {
  test.use({ locale: "en-US" });

  test("defaults to English and remembers a Russian choice across reloads and tabs", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("button", { name: "Update data" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "September 2026" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Interface language" })
      .selectOption("ru");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      page.getByRole("button", { name: "Обновить данные" }),
    ).toBeVisible();
    const cookie = (await context.cookies()).find(
      (item) => item.name === "live_life_language",
    )!;
    expect(cookie.value).toBe("ru");
    expect(cookie.path).toBe("/");
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 86400);
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Язык интерфейса" }),
    ).toHaveValue("ru");
    const second = await context.newPage();
    await second.goto("/day/2026-09-24");
    await expect(second.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      second.getByText("Подробности дня", { exact: true }),
    ).toBeVisible();
  });

  test("translates details, timeline, and help while retaining task text", async ({
    page,
  }) => {
    await page.goto("/day/2026-09-24");
    await expect(page.getByText("Day details", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bracelet", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Моя задача", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Combined timeline of daily events and measurements"),
    ).toBeVisible();
    await expect(
      page.getByText("No measurements", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Data quality and sources legend" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Source icons" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close legend" }).click();
    await page.goto("/timeline/2026-09-24");
    await expect(
      page.getByRole("heading", { name: /Day timeline.*24 September 2026/ }),
    ).toBeVisible();
  });

  test("translates synchronization results and server recovery messages", async ({
    page,
  }) => {
    await page.route("**/api/data-sync", (route) =>
      route.fulfill({
        json: {
          from: snapshot.from,
          to: snapshot.to,
          sources: [
            {
              source: "bracelet",
              status: "not_run",
              records: 0,
              issue: {
                code: "GOOGLE_RECONNECT_REQUIRED",
                action: "reconnect",
                message: "Подключите Google Drive.",
                steps: [
                  "Проверьте подключение к интернету и VPN. Подождите немного и повторите импорт.",
                ],
              },
            },
            ...["welltory", "todoist", "rescuetime"].map((source) => ({
              source,
              status: "success",
              records: 1,
            })),
          ],
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Update data" }).click();
    await expect(
      page.getByRole("heading", { name: "Data update", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Some sources could not be updated", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Connect Google Drive.", { exact: true }),
    ).toBeVisible();
    await page.getByText("How to restore access", { exact: true }).click();
    await expect(
      page.getByText(
        "Check your internet connection and VPN. Wait a moment and retry the import.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(/Bracelet: source unavailable/)).toBeVisible();
  });

  test("keeps the switch at the top right on a narrow screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const box = await page
      .getByRole("combobox", { name: "Interface language" })
      .boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(240);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeLessThan(60);
  });
});

test.describe("Russian browser", () => {
  test.use({ locale: "ru-RU" });
  test("defaults to Russian, then uses the saved English choice", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page
      .getByRole("combobox", { name: "Язык интерфейса" })
      .selectOption("en");
    await expect(
      page.getByRole("button", { name: "Update data" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("Unsupported browser language", () => {
  test.use({ locale: "de-DE" });
  test("falls back to English even when the language cookie is invalid", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "live_life_language",
        value: "invalid",
        url: "http://127.0.0.1:4173",
      },
    ]);
    await page.goto("/");
    await expect(
      page.getByRole("combobox", { name: "Interface language" }),
    ).toHaveValue("en");
  });
});
