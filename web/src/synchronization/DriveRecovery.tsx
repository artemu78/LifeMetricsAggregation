import { t, serverMessage } from "../i18n";
import type { components } from "../generated/api-types";
import { useDriveConnection } from "./useDriveConnection";
import { DriveSetupInstructions } from "./DriveSetupInstructions";

type Issue = components["schemas"]["SourceIssue"];

type DriveRecoveryProps = Readonly<{
  issue?: Issue | null;
  syncing: boolean;
  retry: () => void;
}>;

export function DriveRecovery({ issue, syncing, retry }: DriveRecoveryProps) {
  const { connection, message, busy, pending, connect, upload } =
    useDriveConnection();
  const problem = connection.issue ?? issue;
  const disabled = busy || pending || syncing;
  return (
    <section className="drive-recovery" aria-labelledby="drive-recovery-title">
      <h3 id="drive-recovery-title">{t("Подключение Google Drive")}</h3>
      <div aria-live="polite">
        {connection.status === "success" ? (
          <p>
            {t(
              "Google Drive подключён. Нажмите «Повторить обновление», чтобы загрузить данные браслета.",
            )}
          </p>
        ) : (
          <p>
            {problem?.message
              ? serverMessage(problem.message)
              : t(
                  "Не удалось обновить браслет. Подключите Google Drive или проверьте настройки.",
                )}
          </p>
        )}
        {pending && (
          <p>
            {t(
              "Нажмите «Продолжить вход в Google», завершите вход в отдельной вкладке и вернитесь сюда. Сеанс действует 3 минуты.",
            )}
          </p>
        )}
        {message && <output>{message}</output>}
      </div>
      <div className="drive-recovery-actions">
        <button
          className="button"
          disabled={disabled}
          onClick={() => void connect()}
        >
          {busy ? t("Подождите…") : t("Подключить Google Drive")}
        </button>
        {pending && connection.authorizationUrl && (
          <a
            className="button primary"
            href={connection.authorizationUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("Продолжить вход в Google")}
          </a>
        )}
        <button className="button" disabled={disabled} onClick={retry}>
          {t("Повторить обновление")}
        </button>
      </div>
      <p className="drive-recovery-note">
        {t(
          "Ранее загруженные данные остаются доступны. Пароль вводится только на странице Google.",
        )}
      </p>
      {connection.status !== "success" && problem?.steps.length ? (
        <details>
          <summary>{t("Как восстановить доступ")}</summary>
          <ol>
            {problem.steps.map((step) => (
              <li key={step}>{serverMessage(step)}</li>
            ))}
          </ol>
        </details>
      ) : null}
      <DriveSetupInstructions disabled={disabled} upload={upload} />
      {problem?.diagnosticId && (
        <small>
          {t("Код:")} {problem.code} {t("· Диагностика:")}{" "}
          {problem.diagnosticId}
        </small>
      )}
    </section>
  );
}
