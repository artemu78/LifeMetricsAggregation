import { t, serverMessage } from "../i18n";
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
            <p className="eyebrow">{t("Синхронизация данных")}</p>
            <h2 id="sync-modal-title">{t("Обновление данных")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => store.closeSyncModal()}
            aria-label={t("Закрыть окно обновления")}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="sync-modal-body">
          <SyncStatusBanner />

          <ul className="sync-source-list" aria-label={t("Источники данных")}>
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
            {t("Закрыть")}
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
        <span>{t("Обновляем источники…")}</span>
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
        {t("Обновление завершено не для всех источников")}
      </output>
    );
  } else {
    return (
      <div className="sync-status-banner success">
        <span>{t("Обновление завершено")}</span>
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
  const statusLabel = progress ? sourceStatusLabel(progress) : null;
  return (
    <li
      className={`sync-source-item ${isPending ? "pending" : progress.status}`}
    >
      <span className="sync-source-details">
        <span className="sync-source-name">{label}</span>
        {!isPending &&
        progress.source !== "bracelet" &&
        progress.issue?.message ? (
          <span className="sync-source-message">
            {serverMessage(progress.issue.message)}
          </span>
        ) : null}
      </span>
      <span className="sync-source-result">
        {isPending ? (
          <span
            className="sync-spinner"
            aria-label={t("Обновление: {0}", label)}
          >
            <RefreshCw className="spinning" aria-hidden="true" />
          </span>
        ) : (
          <span className="sync-source-timestamp">{statusLabel}</span>
        )}
      </span>
    </li>
  );
});

function sourceStatusLabel(progress: SourceSyncProgress): string {
  if (progress.status === "success") {
    return progress.display
      ? t("Обновлено: {0}", serverMessage(progress.display))
      : t("Обновлено");
  }
  if (progress.status === "partial") return t("Обновлено частично");
  if (progress.status === "failed") return t("Не обновлено");
  if (progress.display) return serverMessage(progress.display);
  return t("Не запускалось");
}
