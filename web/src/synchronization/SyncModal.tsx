import { RefreshCw, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { SYNC_SOURCES } from "../shared/sourceConfig";
import { useModalDismissAndTrapFocus } from "../shared/useModalDismissAndTrapFocus";
import type { SourceSyncProgress } from "../store";
import { dashboardStore as store } from "../store";
import { DriveRecovery } from "./DriveRecovery";

export const SyncModal = observer(function SyncModal() {
  const modalRef = useRef<HTMLDialogElement>(null);

  useModalDismissAndTrapFocus(modalRef, () => store.closeSyncModal());

  return (
    <div className="modal-backdrop">
      <dialog
        ref={modalRef}
        className="modal sync-modal"
        open
        aria-labelledby="sync-modal-title"
        tabIndex={-1}
      >
        <header className="sync-modal-header">
          <div>
            <p className="eyebrow">Синхронизация данных</p>
            <h2 id="sync-modal-title">Обновление данных</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => store.closeSyncModal()}
            aria-label="Закрыть окно обновления"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="sync-modal-body">
          <SyncStatusBanner />

          <ul className="sync-source-list" aria-label="Источники данных">
            {SYNC_SOURCES.map(({ key, label }) => (
              <SyncSourceItem
                key={key}
                label={label}
                progress={store.syncProgress[key]}
              />
            ))}
          </ul>
          {(store.syncProgress.bracelet?.status === "failed" ||
            store.syncProgress.bracelet?.status === "not_run") && (
            <DriveRecovery
              issue={store.syncProgress.bracelet.issue}
              syncing={store.syncing}
              retry={() => void store.syncAll()}
            />
          )}
        </div>

        <footer className="sync-modal-footer">
          <button
            type="button"
            className="button primary"
            onClick={() => store.closeSyncModal()}
          >
            Закрыть
          </button>
        </footer>
      </dialog>
    </div>
  );
});

const SyncStatusBanner = observer(function SyncStatusBanner() {
  if (store.error) {
    return (
      <div className="sync-status-banner error" role="alert">
        {store.error}
      </div>
    );
  } else if (store.syncing) {
    return (
      <div className="sync-status-banner in-progress">
        <RefreshCw className="spinning" aria-hidden="true" />
        <span>Обновляем источники…</span>
      </div>
    );
  } else if (
    Object.values(store.syncProgress).some(
      (item) =>
        item.status === "failed" ||
        item.status === "not_run" ||
        item.status === "partial",
    )
  ) {
    return (
      <output className="sync-status-banner error">
        Обновление завершено не для всех источников
      </output>
    );
  } else {
    return (
      <div className="sync-status-banner success">
        <span>Обновление завершено</span>
      </div>
    );
  }
});

const SyncSourceItem = observer(function SyncSourceItem({
  label,
  progress,
}: {
  label: string;
  progress?: SourceSyncProgress;
}) {
  const isPending = !progress || progress.status === "pending";
  return (
    <li
      className={`sync-source-item ${isPending ? "pending" : progress.status}`}
    >
      <span className="sync-source-name">{label}</span>
      <span className="sync-source-result">
        {isPending ? (
          <span className="sync-spinner" aria-label={`Обновление: ${label}`}>
            <RefreshCw className="spinning" aria-hidden="true" />
          </span>
        ) : (
          <span className="sync-source-timestamp">
            {progress.display || progress.status}
          </span>
        )}
      </span>
    </li>
  );
});
