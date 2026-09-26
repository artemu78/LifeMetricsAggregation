import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AXIS_VISIBILITY_THRESHOLD } from "./timelineConfig";

export function useTimelineViewport() {
  const [axisVisible, setAxisVisible] = useState(true);
  const [chartScrollLeft, setChartScrollLeft] = useState(0);
  const [axisFrame, setAxisFrame] = useState({
    left: 0,
    width: 0,
    chartWidth: 0,
  });
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const timeAxisRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const axis = timeAxisRef.current;
    if (!axis || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setAxisVisible(entry.isIntersecting),
      { threshold: AXIS_VISIBILITY_THRESHOLD },
    );
    observer.observe(axis);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const scroll = chartScrollRef.current;
    const chart = chartRef.current;
    if (!scroll || !chart) return;
    const measure = () => {
      const scrollRect = scroll.getBoundingClientRect();
      const chartRect = chart.getBoundingClientRect();
      setAxisFrame((current) =>
        current.left === scrollRect.left &&
        current.width === scrollRect.width &&
        current.chartWidth === chartRect.width
          ? current
          : {
              left: scrollRect.left,
              width: scrollRect.width,
              chartWidth: chartRect.width,
            },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(scroll);
    observer?.observe(chart);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return {
    axisVisible,
    chartScrollLeft,
    setChartScrollLeft,
    axisFrame,
    chartScrollRef,
    chartRef,
    timeAxisRef,
  };
}
