import { CircleHelp, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { dashboardStore as store } from "../store";
import { QUALITY, SOURCE_ICONS } from "./dashboardConfig";

export const DashboardLegend = observer(function DashboardLegend() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!store.helpOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node))
        store.closeHelp();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") store.closeHelp();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [store.helpOpen]);

  return (
    <div className="help-container" ref={containerRef}>
      <button
        className="help-button"
        onClick={() => store.toggleHelp()}
        aria-label="Легенда качества и источников"
        aria-expanded={store.helpOpen}
        aria-controls="dashboard-legend"
      >
        <CircleHelp aria-hidden="true" />
      </button>
      {store.helpOpen && (
        <aside
          className="legend"
          id="dashboard-legend"
          aria-labelledby="legend-title"
        >
          <div className="legend-header">
            <h2 id="legend-title">Легенда</h2>
            <button
              className="legend-close"
              onClick={() => store.closeHelp()}
              aria-label="Закрыть легенду"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <section aria-labelledby="quality-legend-title">
            <h3 id="quality-legend-title">Цвет карточки</h3>
            {Object.entries(QUALITY).map(([key, label]) => (
              <p key={key}>
                <i className={`legend-dot quality-${key}`} />
                {label}
              </p>
            ))}
          </section>
          <section
            className="source-legend"
            aria-labelledby="source-legend-title"
          >
            <h3 id="source-legend-title">Иконки источников</h3>
            {SOURCE_ICONS.map(({ name, description, Icon }) => (
              <p key={name}>
                <i className="legend-source-icon">
                  <Icon aria-hidden="true" />
                </i>
                <span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
              </p>
            ))}
            <p className="legend-note">
              Зелёная иконка — данные источника доступны; серая — недоступны.
            </p>
          </section>
        </aside>
      )}
    </div>
  );
});
