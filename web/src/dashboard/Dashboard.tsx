import { RefreshCw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Suspense, useEffect } from "react";
import { Outlet, useMatch } from "react-router";
import { inclusiveDateCount } from "../dashboardWindow";
import { dashboardStore as store } from "../store";
import { SyncModal } from "../synchronization/SyncModal";
import { DashboardCalendar } from "./DashboardCalendar";
import { DashboardLegend } from "./DashboardLegend";

export const Dashboard = observer(function Dashboard() {
  const dayMatch = useMatch("/day/:date");
  const timelineMatch = useMatch("/timeline/:date");
  useEffect(() => {
    void store.load();
  }, []);
  const displayedDayCount =
    store.dashboard?.days.length ?? inclusiveDateCount(store.from, store.to);
  return (
    <main
      className={
        dayMatch || timelineMatch || store.syncModalOpen ? "app blurred" : "app"
      }
    >
      <header className="topbar">
        <div>
          <p className="eyebrow">Локальный обзор</p>
          <h1>Live Life</h1>
          <p className="subtitle">
            Дней: {displayedDayCount} · {store.from} — {store.to}
          </p>
        </div>
        <div className="actions">
          <button
            className="sync-button"
            onClick={() => void store.syncAll()}
            disabled={store.syncing}
          >
            <RefreshCw
              className={store.syncing ? "spinning" : undefined}
              aria-hidden="true"
            />
            {store.syncing ? "Обновляем…" : "Обновить данные"}
          </button>
          <DashboardLegend />
        </div>
      </header>

      {store.error && <div className="message error">{store.error}</div>}
      {store.syncMessage && (
        <div className="message success">{store.syncMessage}</div>
      )}
      {store.loading && !store.dashboard && (
        <div className="loading">Загружаем календарь…</div>
      )}

      <DashboardCalendar days={store.dashboard?.days ?? []} />

      <Suspense
        fallback={
          <div className="modal-backdrop">
            <output className="loading">
              Загружаем подробности дня…
            </output>
          </div>
        }
      >
        <Outlet />
      </Suspense>
      {store.syncModalOpen && <SyncModal />}
    </main>
  );
});
