type Props = { disabled: boolean; upload: (file: File) => Promise<void> };
export function DriveSetupInstructions({ disabled, upload }: Props) {
  return (
    <details>
      <summary>Настроить Google Cloud или заменить удалённый проект</summary>
      <ol>
        <li>
          В{" "}
          <a
            href="https://console.cloud.google.com/cloud-resource-manager"
            target="_blank"
            rel="noreferrer"
          >
            Google Cloud → Manage resources
          </a>{" "}
          выберите проект. Удалённый проект попробуйте восстановить в Resources
          pending deletion. Если восстановление недоступно, создайте новый
          проект.
        </li>
        <li>
          В этом проекте{" "}
          <a
            href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            включите Google Drive API
          </a>
          .
        </li>
        <li>
          В Google Auth Platform заполните Branding и настройте{" "}
          <a
            href="https://console.cloud.google.com/auth/audience"
            target="_blank"
            rel="noreferrer"
          >
            Audience
          </a>
          . В режиме Testing добавьте свой аккаунт в Test users. Разрешение на
          Drive в этом режиме обычно действует 7 дней. Для постоянного
          использования рассмотрите Production; требования проверки определяет
          Google.
        </li>
        <li>
          В{" "}
          <a
            href="https://console.cloud.google.com/auth/clients"
            target="_blank"
            rel="noreferrer"
          >
            Clients
          </a>{" "}
          создайте OAuth client типа Desktop app, скачайте JSON и выберите его
          ниже. Android или Web application здесь не подходят.
        </li>
        <li>
          Нажмите «Подключить Google Drive», завершите вход и повторите
          обновление. Выберите аккаунт, которому доступна папка Reva Health
          Exporter.
        </li>
      </ol>
      <label className="drive-client-upload">
        JSON OAuth-клиента{" "}
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      <p>
        Файл сохраняется только на этом компьютере. Создать или восстановить
        проект и подтвердить согласие нужно на стороне Google.
      </p>
      <p>
        <a
          href="https://developers.google.com/identity/protocols/oauth2#expiration"
          target="_blank"
          rel="noreferrer"
        >
          Почему разрешение может истечь
        </a>{" "}
        ·{" "}
        <a
          href="https://developers.google.com/identity/protocols/oauth2/native-app"
          target="_blank"
          rel="noreferrer"
        >
          Инструкция Google для Desktop app
        </a>
      </p>
    </details>
  );
}
