import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayTimelineChart } from "./DayTimelineChart";
import { App } from "./App";
import { dashboardStore } from "./store";
import type { components } from "./generated/api-types";

type Day = components["schemas"]["DashboardDay"];

const metric = (
  timestamp: string,
  name: string,
  value: number | null,
  extra: { valueText?: string | null; unit?: string | null } = {},
) => ({ timestamp, metric: name, value, ...extra });

const day: Day = {
  date: "2026-09-24",
  weekday: 4,
  currentDay: false,
  quality: "complete",
  sources: [],
  bracelet: { sleepSeconds: 28_800, steps: 5000 },
  welltory: { available: true, count: 2 },
  todoist: { created: 2, completed: 1, deleted: 0 },
  rescuetime: { available: true, count: 3 },
  detail: {
    braceletMetrics: [
      metric("2026-09-24T06:00:00+03:00", "fitness_drive.heart_rate", 65, { unit: "bpm" }),
      metric("2026-09-24T06:05:00+03:00", "fitness_drive.heart_rate", 72, { unit: "bpm" }),
      metric("2026-09-24T07:01:00+03:00", "fitness_drive.steps", 1200),
      metric("2026-09-24T07:14:00+03:00", "fitness_drive.steps", 300),
      metric("2026-09-24T08:00:00+03:00", "fitness_drive.steps", 25),
      metric("2026-09-24T08:00:00+03:00", "fitness_drive.sleep.main", 28_800, { unit: "s" }),
      metric("2026-09-24T09:00:00+03:00", "fitness_drive.exercise", 1),
      metric("2026-09-24T10:00:00+03:00", "fitness_drive.calories", null, { valueText: "42", unit: "kcal" }),
      metric("2026-09-24T10:01:00+03:00", "fitness_drive.note", null, { valueText: null }),
      metric("2026-09-24T10:02:00+03:00", "fitness_drive.sleep.secondary", null),
    ],
    welltoryMetrics: [
      metric("2026-09-24T09:00:00+03:00", "welltory.energy(hrv)", 75),
      metric("2026-09-24T09:00:00+03:00", "welltory.stress(hrv)", 30),
      metric("2026-09-24T09:02:00+03:00", "welltory.energy(hrv)", 0),
      metric("2026-09-24T09:02:00+03:00", "welltory.stress(hrv)", 0),
      metric("2026-09-24T09:04:00+03:00", "welltory.energy(hrv)", 50),
      metric("2026-09-24T09:04:00+03:00", "welltory.stress(hrv)", null),
      metric("2026-09-24T08:00:00+03:00", "welltory.stress(hrv)", 60),
      metric("2026-09-24T04:00:00+03:00", "welltory.energy(hrv)", 25),
    ],
    createdTasks: [
      { timestamp: "2026-09-24T11:00:00+03:00", content: "First task" },
      { timestamp: "2026-09-24T11:05:00+03:00", content: "Second task" },
      { timestamp: "2026-09-24T22:00:00+03:00", content: "Late task" },
    ],
    completedTasks: [
      { timestamp: "2026-09-24T11:08:00+03:00", content: "Done task" },
    ],
    deletedTasks: [],
    emaEvents: [
      { timestamp: "2026-09-24T12:00:00+03:00", status: "pending" },
      { timestamp: "2026-09-24T12:01:00+03:00", status: "answered" },
      { timestamp: "2026-09-24T12:02:00+03:00", status: "dismissed" },
      { timestamp: "2026-09-24T12:03:00+03:00", status: "expired" },
    ],
    rescueTime: [
      { timestamp: "2026-09-24T13:00:00+03:00", perspective: "activity", label: "Browser", seconds: 900 },
      { timestamp: "2026-09-24T13:00:00+03:00", perspective: "activity", label: "Browser", seconds: 300 },
      { timestamp: "2026-09-24T14:00:00+03:00", perspective: "productivity", label: "2", seconds: 1800 },
      { timestamp: "2026-09-24T14:30:00+03:00", perspective: "productivity", label: "-2", seconds: 600 },
      { timestamp: "2026-09-24T15:00:00+03:00", perspective: "productivity", label: "unknown", seconds: 600 },
    ],
  },
};

const nextSleepMetrics = [
  metric("2026-09-24T06:30:00+03:00", "fitness_drive.sleep.main", 0),
];

function installIntersectionObserver() {
  const disconnect = vi.fn();
  const observe = vi.fn(function (this: unknown, target: Element) {
    const callback = callbacks.at(-1);
    callback?.([{ isIntersecting: false, target } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  const callbacks: IntersectionObserverCallback[] = [];
  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback);
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = () => [];
    root = null;
    rootMargin = "0px";
    thresholds = [0.05];
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  return { disconnect, observe };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("DayTimelineChart", () => {
  it("renders the day tracks, clusters nearby Todoist events, and uses the sticky axis when needed", () => {
    const observer = installIntersectionObserver();
    const { container, unmount } = render(
      <DayTimelineChart day={day} timezone="Europe/Moscow" nextDaySleepMetrics={nextSleepMetrics} />,
    );

    expect(screen.getByRole("region", { name: "Общий график событий и показателей дня" })).toBeInTheDocument();
    expect(container.querySelectorAll(".heart-rate-path")).toHaveLength(1);
    expect(container.querySelectorAll(".chart-step-bar")).toHaveLength(2);
    expect(container.querySelectorAll(".chart-sleep-boundary")).toHaveLength(2);
    expect(container.querySelectorAll(".welltory-measurement")).toHaveLength(4);
    expect(container.querySelectorAll(".chart-duration-segment")).toHaveLength(5);
    expect(container.querySelectorAll(".todoist-marker")).toHaveLength(2);
    expect(within(container).getByText("3", { selector: ".todoist-count-badge" })).toBeInTheDocument();
    expect(container.querySelectorAll(".chart-time-axis .chart-tick").length).toBeGreaterThan(0);
    expect(container.querySelector(".chart-axis-sticky")).toBeInTheDocument();
    expect(observer.observe).toHaveBeenCalled();

    const step = container.querySelector(".chart-step-hit-area")!;
    fireEvent.mouseEnter(step, { clientX: 200, clientY: 120 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1 500 шагов");

    fireEvent.mouseMove(container.querySelector(".heart-rate-hit-area")!, { clientX: 300 });
    expect(container.querySelector(".heart-hover-popup")).toBeInTheDocument();

    fireEvent.mouseMove(container.querySelector(".todoist-marker")!, { clientX: 1000, clientY: 700 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("First task");
    fireEvent.mouseLeave(container.querySelector(".day-chart-scroll")!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    const interactiveItems = container.querySelectorAll<SVGElement | HTMLButtonElement>(
      ".chart-sleep-boundary, .chart-step-hit-area, .chart-step-bar, .chart-duration-segment, .chart-event-dot, .welltory-measurement, .todoist-marker",
    );
    for (const [index, item] of [...interactiveItems].entries()) {
      const corners = [
        { clientX: 2, clientY: 2 },
        { clientX: window.innerWidth - 2, clientY: 2 },
        { clientX: 2, clientY: window.innerHeight - 2 },
        { clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 },
      ];
      const cursor = corners[index % corners.length];
      fireEvent.mouseEnter(item, cursor);
      fireEvent.mouseMove(item, cursor);
      fireEvent.click(item, cursor);
    }
    fireEvent.mouseLeave(container.querySelector(".heart-rate-hit-area")!);
    fireEvent.scroll(container.querySelector(".day-chart-scroll")!, { target: { scrollLeft: 24 } });

    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("selects Welltory and event details and clears selection when the pointer leaves chart items", () => {
    const { container } = render(<DayTimelineChart day={day} timezone="Europe/Moscow" />);
    const energyMeasurement = [...container.querySelectorAll(".welltory-measurement")]
      .find((measurement) => measurement.textContent?.includes("75"))!;
    fireEvent.mouseMove(energyMeasurement, { clientX: 300, clientY: 200 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Welltory · energy(hrv) · 75 · stress(hrv) · 30");

    fireEvent.mouseEnter(container.querySelector(".chart-event-dot")!, { clientX: 350, clientY: 220 });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseMove(container.querySelector(".chart-gridline")!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders a helpful empty state for a day without chart data", () => {
    const emptyDay: Day = {
      ...day,
      detail: {
        braceletMetrics: [],
        welltoryMetrics: [],
        createdTasks: [],
        completedTasks: [],
        deletedTasks: [],
        emaEvents: [],
        rescueTime: [],
      },
    };
    render(<DayTimelineChart day={emptyDay} timezone="Europe/Moscow" />);
    expect(screen.getByText("Для этой даты нет точек графика.")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the closest heart sample and safely ignores a missing SVG box", () => {
    const { container } = render(<DayTimelineChart day={day} timezone="Europe/Moscow" />);
    const hitArea = container.querySelector<SVGRectElement>(".heart-rate-hit-area")!;
    const svg = hitArea.ownerSVGElement!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1240,
      height: 760,
      right: 1240,
      bottom: 760,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.mouseMove(hitArea, { clientX: 177 });
    expect(container.querySelector(".heart-hover-popup")).toHaveTextContent("06:05");
    fireEvent.mouseLeave(hitArea);
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(undefined as unknown as DOMRect);
    fireEvent.mouseMove(hitArea, { clientX: 177 });
    expect(container.querySelector(".heart-hover-popup")).not.toBeInTheDocument();
  });

  it("handles crowded Todoist events, fallback EMA statuses, and events outside the logical day", () => {
    const crowdedDay: Day = {
      ...day,
      detail: {
        ...day.detail,
        braceletMetrics: [
          metric("2026-09-24T04:00:00+03:00", "fitness_drive.sleep.main", 0),
          metric("2026-09-24T03:00:00+03:00", "fitness_drive.steps", -10),
          metric("2026-09-24T05:01:00+03:00", "fitness_drive.steps", 5),
          metric("2026-09-24T05:02:00+03:00", "fitness_drive.heart_rate", null),
        ],
        welltoryMetrics: [
          metric("2026-09-25T06:00:00+03:00", "welltory.energy(hrv)", null),
          metric("2026-09-24T10:00:00+03:00", "welltory.unknown", 20),
        ],
        createdTasks: [
          ...Array.from({ length: 100 }, (_, index) => ({
            timestamp: "2026-09-24T11:00:00+03:00",
            content: `Task ${index}`,
          })),
          ...Array.from({ length: 70 }, (_, index) => {
            return {
              timestamp: new Date(
                Date.parse("2026-09-24T11:20:00+03:00") + (index * 20 + 20) * 60_000,
              ).toISOString(),
              content: `Separated task ${index}`,
            };
          }),
        ],
        completedTasks: [],
        deletedTasks: [],
        emaEvents: [
          { timestamp: "2026-09-24T11:00:00+03:00", status: "unknown" },
        ] as unknown as Day["detail"]["emaEvents"],
        rescueTime: [
          { timestamp: "2026-09-24T04:00:00+03:00", perspective: "activity", label: "", seconds: 0 },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={crowdedDay} timezone="Europe/Moscow" />);
    expect(within(container).getByText("99+", { selector: ".todoist-count-badge" })).toBeInTheDocument();
    expect(container.querySelectorAll(".chart-sleep-boundary")).toHaveLength(1);
    fireEvent.mouseEnter(container.querySelector(".todoist-marker")!, { clientX: 300, clientY: 400 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Task 0");
  });

  it("opens the timeline route in a native dialog and closes it from the backdrop control", async () => {
    const dashboard = {
      from: day.date,
      to: day.date,
      timezone: "Europe/Moscow",
      generatedAt: "2026-09-24T12:00:00+03:00",
      days: [day],
    };
    dashboardStore.dashboard = dashboard as unknown as typeof dashboardStore.dashboard;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => dashboard,
    }));
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true; },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = false; },
    });

    const { container } = render(
      <MemoryRouter initialEntries={[`/timeline/${day.date}`]}>
        <App />
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole("dialog", { name: /Ход дня/ });
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть Ход дня" }));
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(container.querySelector(".day-chart-card")).not.toBeInTheDocument();
    await waitFor(() => expect(dashboardStore.loading).toBe(false));
    dashboardStore.dashboard = null;
  });
});
