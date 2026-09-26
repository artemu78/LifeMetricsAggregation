import { expect, test } from "@playwright/test";

const day = (date: string, weekday: number) => ({
  date,
  weekday,
  currentDay: date === "2026-09-25",
  quality: "complete" as const,
  sources: [
    { source: "bracelet" as const, status: "success" as const },
    { source: "welltory" as const, status: "success" as const },
    { source: "todoist" as const, status: "success" as const },
    { source: "rescuetime" as const, status: "success" as const },
  ],
  bracelet: { sleepSeconds: 25_200, steps: 8_420 },
  welltory: { available: true, count: 1 },
  todoist: { created: 1, completed: 1, deleted: 0 },
  rescuetime: { available: true, count: 1 },
  detail: {
    braceletMetrics: [],
    welltoryMetrics: [
      {
        timestamp: `${date}T09:00:00+03:00`,
        metric: "welltory.energy",
        value: 73,
        unit: "%",
      },
    ],
    createdTasks: [
      { content: "Проверить план на день", timestamp: `${date}T10:00:00+03:00` },
    ],
    completedTasks: [],
    deletedTasks: [],
    emaEvents: [],
    rescueTime: [],
  },
});

const dashboard = {
  from: "2026-09-24",
  to: "2026-09-25",
  timezone: "Europe/Moscow",
  generatedAt: "2026-09-26T06:00:00Z",
  days: [day("2026-09-24", 4), day("2026-09-25", 5)],
};

async function mockDashboard(page: import("@playwright/test").Page) {
  await page.route("**/api/dashboard?**", (route) =>
    route.fulfill({ json: dashboard }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
});

test("loads the dashboard calendar and opens day details", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Live Life" })).toBeVisible();
  await expect(page.getByRole("link", { name: /2026-09-24/ })).toBeVisible();
  await page.getByRole("link", { name: /2026-09-24/ }).click();

  await expect(page).toHaveURL(/\/day\/2026-09-24$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026-09-24" })).toBeVisible();
  await expect(page.getByText("Проверить план на день")).toBeVisible();
});

test("navigates between day details with arrow keys and closes with Escape", async ({ page }) => {
  await page.goto("/day/2026-09-24");
  await expect(page.getByRole("heading", { name: "2026-09-24" })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/day\/2026-09-25$/);
  await expect(page.getByRole("heading", { name: "2026-09-25" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("opens and closes the Ход дня timeline", async ({ page }) => {
  await page.goto("/timeline/2026-09-24");

  await expect(page.getByRole("heading", { name: /Ход дня/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Закрыть Ход дня" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/day\/2026-09-24$/);
});

test("opens the legend and dismisses it with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Легенда качества и источников" }).click();

  await expect(page.getByRole("heading", { name: "Легенда" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Легенда" })).toHaveCount(0);
});

test("reports a dashboard loading error", async ({ page }) => {
  await page.unroute("**/api/dashboard?**");
  await page.route("**/api/dashboard?**", (route) =>
    route.fulfill({ status: 503, json: { message: "service unavailable" } }),
  );
  await page.goto("/");

  await expect(page.getByText(/service unavailable|Не удалось загрузить/i)).toBeVisible();
});

test("shows source synchronization progress and its partial result", async ({ page }) => {
  await page.route("**/api/data-sync", (route) =>
    route.fulfill({
      json: {
        from: dashboard.from,
        to: dashboard.to,
        sources: [
          { source: "bracelet", status: "success", records: 4 },
          { source: "welltory", status: "partial", records: 1 },
          { source: "todoist", status: "success", records: 2 },
          { source: "rescuetime", status: "success", records: 1 },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Обновить данные" }).click();

  await expect(page.getByRole("heading", { name: "Обновление данных" })).toBeVisible();
  await expect(page.getByText("Обновление завершено не для всех источников")).toBeVisible();
  await expect(page.getByText("обновлено частично", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть окно обновления" }).click();
  await expect(page.getByRole("heading", { name: "Обновление данных" })).toHaveCount(0);
});
