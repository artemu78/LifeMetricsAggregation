import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Dashboard } from "./dashboard/Dashboard";

const DayRoute = lazy(() =>
  import("./dashboard/DayRoutes").then((routes) => ({
    default: routes.DayRoute,
  })),
);
const TimelineRoute = lazy(() =>
  import("./dashboard/DayRoutes").then((routes) => ({
    default: routes.TimelineRoute,
  })),
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />}>
        <Route path="day/:date" element={<DayRoute />} />
        <Route path="timeline/:date" element={<TimelineRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
