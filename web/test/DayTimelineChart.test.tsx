import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { runInAction } from "mobx";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayTimelineChart } from "../src/timeline/DayTimelineChart";
import { App } from "../src/App";
import { dashboardStore } from "../src/store";
import type { components } from "../src/generated/api-types";

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

function installDashboard() {
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
    expect(container.querySelectorAll(".chart-duration-segment")).toHaveLength(2);
    expect(container.querySelectorAll(".chart-workout-segment")).toHaveLength(1);
    expect(within(container).getByText("ТРЕНИРОВКИ")).toBeInTheDocument();
    expect(container.querySelectorAll(".todoist-marker")).toHaveLength(2);
    expect(within(container).getByText("3", { selector: ".todoist-count-badge" })).toBeInTheDocument();
    expect(container.querySelectorAll(".chart-time-axis .chart-tick").length).toBeGreaterThan(0);
    expect(container.querySelector(".chart-axis-sticky")).toBeInTheDocument();
    expect(observer.observe).toHaveBeenCalled();

    const workout = container.querySelector(".chart-workout-segment")!;
    fireEvent.mouseEnter(workout, { clientX: 250, clientY: 330 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Тренировка · 1 сек");

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

  it("groups consecutive activity rows by name and productivity level in five lanes", () => {
    const activityDay: Day = {
      ...day,
      date: "2026-09-18",
      detail: {
        ...day.detail,
        rescueTime: [
          { timestamp: "2026-09-18T16:10:00+03:00", perspective: "activity", label: "Search", seconds: 44, productivityLevel: 0 },
          { timestamp: "2026-09-18T16:10:00+03:00", perspective: "activity", label: "Zoom", seconds: 256, productivityLevel: 1 },
          { timestamp: "2026-09-18T16:15:00+03:00", perspective: "activity", label: "Chat", seconds: 9, productivityLevel: -2 },
          { timestamp: "2026-09-18T16:15:00+03:00", perspective: "activity", label: "Zoom", seconds: 291, productivityLevel: 1 },
          { timestamp: "2026-09-18T16:15:00+03:00", perspective: "productivity", label: "1", seconds: 291 },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={activityDay} timezone="Europe/Moscow" />);
    expect(within(container).getByText("АКТИВНОСТЬ")).toBeInTheDocument();
    expect(within(container).queryByText("ПРОДУКТИВНОСТЬ")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".chart-activity-lane-label")).toHaveLength(5);
    const segments = [...container.querySelectorAll<SVGRectElement>(".chart-activity-segment")];
    const zoom = segments.filter((segment) => segment.getAttribute("aria-label")?.startsWith("Zoom"));
    expect(zoom).toHaveLength(1);
    expect(zoom[0]).toHaveAttribute("y", "286");
    expect(zoom[0]).toHaveAttribute("aria-label", expect.stringContaining("Другая работа"));
    const chat = segments.find((segment) => segment.getAttribute("aria-label")?.startsWith("Chat"))!;
    expect(chat).toHaveAttribute("y", "328");
    expect(segments).toHaveLength(3);
    fireEvent.mouseEnter(zoom[0], { clientX: 350, clientY: 220 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Zoom · Другая работа");
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

  it("keeps the hover time on the sticky axis aligned with the chart while scrolling", () => {
    installIntersectionObserver();
    const { container } = render(<DayTimelineChart day={day} timezone="Europe/Moscow" />);
    const scroll = container.querySelector<HTMLElement>(".day-chart-scroll")!;
    const chart = scroll.querySelector<SVGSVGElement>("svg")!;
    let chartLeft = 20;
    vi.spyOn(scroll, "getBoundingClientRect").mockImplementation(() => ({
      left: 20, width: 600, top: 0, height: 500, right: 620, bottom: 500,
      x: 20, y: 0, toJSON: () => ({}),
    } as DOMRect));
    vi.spyOn(chart, "getBoundingClientRect").mockImplementation(() => ({
      left: chartLeft, width: 1240, top: 0, height: 500, right: chartLeft + 1240, bottom: 500,
      x: chartLeft, y: 0, toJSON: () => ({}),
    } as DOMRect));
    fireEvent(window, new Event("resize"));
    fireEvent.mouseEnter(scroll, { clientX: 300 });

    const chartTime = () => container.querySelector(".chart-time-axis .chart-cursor-time text")?.textContent;
    const stickyTime = () => container.querySelector(".chart-axis-sticky .chart-cursor-time text")?.textContent;
    expect(chartTime()).toBeTruthy();
    expect(stickyTime()).toBe(chartTime());
    expect(container.querySelector(".chart-axis-sticky")).toHaveStyle({ left: "20px", width: "600px" });
    expect(container.querySelector(".chart-axis-sticky svg")).toHaveStyle({ width: "1240px" });

    const originalX = Number(container.querySelector(".chart-cursor-line")?.getAttribute("x1"));
    chartLeft = -80;
    fireEvent.scroll(scroll, { target: { scrollLeft: 100 } });
    expect(Number(container.querySelector(".chart-cursor-line")?.getAttribute("x1"))).toBeCloseTo(originalX + 100, 0);
    expect(stickyTime()).toBe(chartTime());
    expect(container.querySelector(".chart-axis-sticky svg")).toHaveStyle({ transform: "translateX(-100px)" });

    fireEvent.mouseLeave(scroll);
    expect(container.querySelector(".chart-cursor-line")).not.toBeInTheDocument();
    expect(stickyTime()).toBeUndefined();
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
    installDashboard();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true; },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = false; },
    });

    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    const { container } = render(
      <MemoryRouter initialEntries={[`/timeline/${day.date}`]}>
        <App />
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole("dialog", { name: /Ход дня/ });
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(true));
    await waitFor(() => expect(dashboardStore.loading).toBe(false));
    const dismiss = screen.getByRole("button", { name: "Закрыть Ход дня" });
    dismiss.focus();
    showModal.mockClear();
    close.mockClear();
    act(() => { runInAction(() => { installDashboard(); }); });
    expect(showModal).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(dismiss).toHaveFocus();
    fireEvent.click(dismiss);
    expect(await screen.findByRole("dialog", { name: day.date })).toBeInTheDocument();
    expect(close).toHaveBeenCalledOnce();
    expect(container.querySelector(".day-detail-modal .day-chart-card")).toBeInTheDocument();
    await waitFor(() => expect(dashboardStore.loading).toBe(false));
    dashboardStore.dashboard = null;
  });

  it("does not show EMA events without responses and only shows answered EMA events", () => {
    const emaDay: Day = {
      ...day,
      detail: {
        ...day.detail,
        emaEvents: [
          { timestamp: "2026-09-24T12:00:00+03:00", status: "pending" },
          { timestamp: "2026-09-24T12:01:00+03:00", status: "answered" },
          { timestamp: "2026-09-24T12:02:00+03:00", status: "dismissed" },
          { timestamp: "2026-09-24T12:03:00+03:00", status: "expired" },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={emaDay} timezone="Europe/Moscow" />);
    const emaGauges = container.querySelectorAll(".ema-speedometer");
    expect(emaGauges).toHaveLength(1);
    expect(container.querySelector("circle[fill='#c39439']")).not.toBeInTheDocument();
    expect(container.querySelector("circle[fill='#b45c54']")).not.toBeInTheDocument();
    expect(container.querySelector("circle[fill='#87948e']")).not.toBeInTheDocument();

    fireEvent.mouseEnter(emaGauges[0], { clientX: 350, clientY: 220 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("EMA · ответ отправлен");
  });

  it("shows EMA event details including mood, energy, focus, stress, activity, and note in tooltip without numbers or titles on gauge", () => {
    const emaDay: Day = {
      ...day,
      detail: {
        ...day.detail,
        emaEvents: [
          {
            timestamp: "2026-09-24T12:01:00+03:00",
            status: "answered",
            mood: 4,
            energy: 3,
            focus: 2,
            stress: 1,
            activity: "work_coding",
            note: "focused session",
          },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={emaDay} timezone="Europe/Moscow" />);
    const emaGauge = container.querySelector(".ema-speedometer");
    expect(emaGauge).toBeInTheDocument();

    // Verify 3 concentric tracks are present: mood (outer), energy (middle), stress (inner)
    expect(emaGauge!.querySelector(".ema-track-mood")).toBeInTheDocument();
    expect(emaGauge!.querySelector(".ema-track-energy")).toBeInTheDocument();
    expect(emaGauge!.querySelector(".ema-track-stress")).toBeInTheDocument();

    // Verify no numbers and no text titles are rendered inside the speedometer gauge
    expect(emaGauge!.querySelector("text")).toBeNull();

    fireEvent.mouseEnter(emaGauge!, { clientX: 350, clientY: 220 });
    fireEvent.mouseMove(emaGauge!, { clientX: 351, clientY: 221 });
    fireEvent.click(emaGauge!, { clientX: 351, clientY: 221 });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("EMA · ответ отправлен");
    expect(tooltip).toHaveTextContent("настроение: 4/5, энергия: 3/5, фокус: 2/5, стресс: 1/5");
    expect(tooltip).toHaveTextContent("занятие: Work / coding");
    expect(tooltip).toHaveTextContent("заметка: focused session");
  });

  it("renders EMA activity as Lucide icon on СОБЫТИЯ track above other events", () => {
    const emaDay: Day = {
      ...day,
      detail: {
        ...day.detail,
        emaEvents: [
          {
            timestamp: "2026-09-24T12:01:00+03:00",
            status: "answered",
            mood: 4,
            energy: 3,
            focus: 2,
            stress: 1,
            activity: "work_coding",
            note: "focused session",
          },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={emaDay} timezone="Europe/Moscow" />);
    const activityMarker = container.querySelector(".ema-activity-marker");
    expect(activityMarker).toBeInTheDocument();
    expect(activityMarker).toHaveAttribute("aria-label", "EMA · Work / coding");

    // The foreignObject containing the activity marker should be at y = 494 (above dots at cy >= 526)
    const foreignObject = activityMarker!.parentElement;
    expect(foreignObject).toHaveAttribute("y", "494");

    // Hovering and clicking the activity icon displays the EMA activity tooltip
    fireEvent.mouseEnter(activityMarker!, { clientX: 350, clientY: 220 });
    fireEvent.mouseMove(activityMarker!, { clientX: 351, clientY: 221 });
    fireEvent.click(activityMarker!, { clientX: 351, clientY: 221 });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("EMA · Work / coding");
    expect(tooltip).toHaveTextContent("заметка: focused session");
  });

  it("renders workout blocks with durations, titles, and hover tooltip on the separate track", () => {
    const workoutDay: Day = {
      ...day,
      detail: {
        ...day.detail,
        braceletMetrics: [
          {
            timestamp: "2026-09-24T08:00:00+03:00",
            metric: "fitness_drive.exercise",
            value: 2700,
            valueText: "Бег",
          },
          {
            timestamp: "2026-09-24T14:00:00+03:00",
            metric: "fitness_drive.exercise",
            value: 3600,
            valueText: "Велосипед",
          },
          {
            timestamp: "2026-09-24T16:00:00+03:00",
            metric: "fitness_drive.exercise",
            value: 0,
            valueText: "",
          },
          {
            timestamp: "2026-09-24T18:00:00+03:00",
            metric: "fitness_drive.exercise",
            value: 4800,
          },
        ],
      },
    };
    const { container } = render(<DayTimelineChart day={workoutDay} timezone="Europe/Moscow" />);
    const workoutSegments = container.querySelectorAll(".chart-workout-segment");
    expect(workoutSegments).toHaveLength(4);

    fireEvent.mouseEnter(workoutSegments[0], { clientX: 200, clientY: 330 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Бег · 45 мин");

    fireEvent.mouseEnter(workoutSegments[1], { clientX: 400, clientY: 330 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Велосипед · 1 ч");

    fireEvent.mouseEnter(workoutSegments[2], { clientX: 500, clientY: 330 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Тренировка");

    fireEvent.mouseEnter(workoutSegments[3], { clientX: 600, clientY: 330 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Тренировка · 1 ч 20 мин");
  });

  it("renders day-chart-card inside day-detail-modal instead of the full timeline link", async () => {
    installDashboard();

    const { container } = render(
      <MemoryRouter initialEntries={[`/day/${day.date}`]}>
        <App />
      </MemoryRouter>,
    );

    const modal = await screen.findByRole("dialog", { name: day.date });
    expect(modal).toHaveClass("day-detail-modal");
    expect(within(modal).getByRole("region", { name: "Общий график событий и показателей дня" })).toBeInTheDocument();
    expect(within(modal).queryByText("Открыть полную хронологию дня")).not.toBeInTheDocument();
    expect(container.querySelector(".day-detail-modal .day-chart-card")).toBeInTheDocument();

    dashboardStore.dashboard = null;
  });
});

it("updates track content and sleep boundaries when a dashboard snapshot is replaced", () => {
  const view = render(<DayTimelineChart day={day} timezone="Europe/Moscow" />);
  expect(view.container.querySelectorAll(".chart-step-bar")).toHaveLength(2);
  const updated: Day = {
    ...day,
    detail: {
      ...day.detail,
      braceletMetrics: [metric("2026-09-24T07:00:00+03:00", "fitness_drive.steps", 900)],
      createdTasks: [{ timestamp: "2026-09-24T11:00:00+03:00", content: "Updated task" }],
      completedTasks: [],
    },
  };
  view.rerender(<DayTimelineChart day={updated} timezone="Europe/Moscow" nextDaySleepMetrics={nextSleepMetrics} />);
  expect(view.container.querySelectorAll(".chart-step-bar")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /Updated task/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /First task/ })).not.toBeInTheDocument();
  expect(view.container.querySelector(".chart-sleep-boundary")).toHaveTextContent("СОН · 06:30");
  fireEvent.mouseEnter(view.container.querySelector(".chart-step-bar")!, { clientX: 300, clientY: 400 });
  expect(screen.getByRole("tooltip")).toHaveTextContent("900 шагов");
  view.rerender(<DayTimelineChart day={updated} timezone="UTC" />);
  expect(view.container.querySelector(".chart-sleep-boundary")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Updated task/ })).toHaveAttribute("aria-label", "08:00 · Задача создана · Updated task");
});

it("gives each mounted timeline its own SVG clipping definition", () => {
  const view = render(<><DayTimelineChart day={day} timezone="Europe/Moscow" /><DayTimelineChart day={day} timezone="Europe/Moscow" /></>);
  const charts = view.container.querySelectorAll("svg.day-chart");
  const clipIds = Array.from(charts, chart => chart.querySelector("clipPath")!.id);
  expect(new Set(clipIds).size).toBe(2);
  charts.forEach((chart, index) => {
    expect(chart.querySelector(".heart-rate-series > g")).toHaveAttribute("clip-path", `url(#${clipIds[index]})`);
  });
});

it("redirects a malformed timeline date without parsing it as a calendar date", async () => {
  installDashboard();
  render(<MemoryRouter initialEntries={["/timeline/not-a-date"]}><App /></MemoryRouter>);
  await waitFor(() => expect(dashboardStore.loading).toBe(false));
  expect(await screen.findByRole("link", { name: new RegExp(day.date) })).toBeInTheDocument();
  await waitFor(() => expect(document.querySelector("main")).not.toHaveClass("blurred"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
