// UI messages supplied by the local server. Never apply to source records or user text.
export const serverEnglish: Record<string, string> = {
  "Откройте Live Life на этом компьютере и повторите действие.":
    "Open Live Life on this computer and try again.",
  "Выберите небольшой JSON-файл OAuth-клиента типа Desktop app.":
    "Select a small Desktop app OAuth client JSON file.",
  "Не удалось прочитать JSON-файл OAuth-клиента.":
    "Could not read the OAuth client JSON file.",
  "Проверьте формат и диапазон дат.": "Check the date format and range.",
  "Дата «to» должна быть не раньше «from».":
    "The “to” date must not be earlier than “from”.",
  "Формирование календаря заняло слишком много времени.":
    "Generating the calendar took too long.",
  "Не удалось сформировать данные календаря.":
    "Could not generate calendar data.",
  "Скрипт вернул некорректный результат.":
    "The worker returned an invalid result.",
  "Обновление данных уже выполняется.": "A data update is already running.",
  "Данные не обновлены. Проверьте журнал data/logs/bracelet.jsonl.":
    "Data was not updated. Check data/logs/bracelet.jsonl.",
  "Обновление данных заняло слишком много времени. Повторите обновление.":
    "The data update took too long. Try updating again.",
  "Не удалось завершить обновление данных.":
    "Could not complete the data update.",
  "Обновление данных заняло слишком много времени.":
    "The data update took too long.",
  "Данные не обновлены.": "Data was not updated.",
  "Откройте Google Cloud и выберите действующий проект. Удалённый проект можно попытаться восстановить в «Manage resources → Resources pending deletion»; иначе создайте новый.":
    "Open Google Cloud and select an active project. Try restoring a deleted project in “Manage resources → Resources pending deletion”; otherwise create a new one.",
  "В выбранном проекте включите Google Drive API. В Google Auth Platform настройте Branding и Audience; для режима Testing добавьте свой Google-аккаунт в Test users.":
    "Enable the Google Drive API in the selected project. Configure Branding and Audience in Google Auth Platform; in Testing mode, add your Google account to Test users.",
  "В Google Auth Platform → Clients создайте OAuth client типа Desktop app и скачайте JSON. Загрузите его здесь, затем подключите Google Drive.":
    "In Google Auth Platform → Clients, create a Desktop app OAuth client and download its JSON file. Upload it here, then connect Google Drive.",
  "Нажмите «Подключить Google Drive» и выберите аккаунт с доступом к папке экспортов браслета. Разрешите чтение Google Drive.":
    "Click “Connect Google Drive” and select an account with access to the Bracelet exports folder. Allow Google Drive read access.",
  "Если Google сообщает deleted_client или invalid_client, откройте настройку Google Cloud ниже и загрузите новый JSON клиента.":
    "If Google reports deleted_client or invalid_client, open Google Cloud setup below and upload a new client JSON file.",
  "В режиме Testing разрешение на Drive обычно истекает через 7 дней. В Google Auth Platform → Audience можно перевести приложение в Production; Google может потребовать проверку. После изменения подключите Drive заново.":
    "In Testing mode, Drive access usually expires after 7 days. You can switch to Production in Google Auth Platform → Audience; Google may require verification. Reconnect Drive after changing this.",
  "Ответ Google не соответствует текущему сеансу входа. Начните подключение заново.":
    "Google's response does not match the current sign-in session. Start connecting again.",
  "Google не принимает OAuth-клиент: он удалён, отключён или настроен неверно. Проверьте проект Google Cloud.":
    "Google rejected the OAuth client: it may be deleted, disabled, or incorrectly configured. Check the Google Cloud project.",
  "Google Drive API отключён или недоступен в проекте OAuth-клиента.":
    "The Google Drive API is disabled or unavailable in the OAuth client's project.",
  "Откройте Google Cloud → APIs & Services → Library → Google Drive API в проекте этого OAuth-клиента и нажмите Enable. Затем повторите импорт.":
    "Open Google Cloud → APIs & Services → Library → Google Drive API in this OAuth client's project and click Enable. Then retry the import.",
  "Google не разрешил подключение этому аккаунту или приложению.":
    "Google did not allow this account or application to connect.",
  "Проверьте Test users и Audience в Google Auth Platform. Для рабочего аккаунта обратитесь к администратору. При отмене входа попробуйте подключиться снова.":
    "Check Test users and Audience in Google Auth Platform. For a work account, contact your administrator. If you cancelled signing in, try connecting again.",
  "Разрешение Google истекло, отозвано или не включает чтение Drive. Подключите аккаунт заново.":
    "Google access has expired, was revoked, or does not include Drive read access. Reconnect the account.",
  "Google Drive временно недоступен. Автоматические повторные попытки не помогли.":
    "Google Drive is temporarily unavailable. Automatic retries did not help.",
  "Проверьте подключение к интернету и VPN. Подождите немного и повторите импорт.":
    "Check your internet connection and VPN. Wait a moment and retry the import.",
  "Нет доступа к папке или файлу Google Drive, либо они удалены.":
    "The Google Drive folder or file is inaccessible or has been deleted.",
  "Откройте папку экспортов в Google Drive и проверьте доступ выбранного аккаунта. Если нужно, подключите другой аккаунт.":
    "Open the exports folder in Google Drive and check the selected account's access. Connect another account if needed.",
  "Если папка перемещена в корзину, восстановите её. Если создана новая папка, обновите GOOGLE_DRIVE_FOLDER_ID в .env.":
    "If the folder is in the trash, restore it. If you created a new folder, update GOOGLE_DRIVE_FOLDER_ID in .env.",
  "Google не смог обновить разрешение. Причина не распознана.":
    "Google could not refresh access. The cause is unknown.",
  "Не удалось прочитать или сохранить локальные файлы браслета.":
    "Could not read or save local Bracelet files.",
  "Проверьте свободное место и права доступа к папке приложения. Если ошибка повторяется, проверьте журнал data/logs/bracelet.jsonl.":
    "Check free disk space and access permissions for the application folder. If the error persists, check data/logs/bracelet.jsonl.",
  "Импорт браслета не завершён. Подробности сохранены в локальном журнале.":
    "The Bracelet import did not complete. Details were saved in the local log.",
  "Повторите импорт. Если ошибка остаётся, проверьте журнал data/logs/bracelet.jsonl.":
    "Retry the import. If the error persists, check data/logs/bracelet.jsonl.",
  "Нужен JSON OAuth-клиента типа Desktop app из Google Cloud.":
    "A Desktop app OAuth client JSON file from Google Cloud is required.",
  "Дождитесь завершения текущего обновления или подключения Google Drive.":
    "Wait for the current update or Google Drive connection to finish.",
  "Сеанс подключения завершён или сервер перезапущен. Начните подключение снова.":
    "The connection session ended or the server restarted. Start connecting again.",
  "Google не выдал долговременное разрешение на чтение Drive. Подключитесь снова и разрешите чтение.":
    "Google did not grant long-term Drive read access. Reconnect and allow read access.",
  "Вход не завершён за 3 минуты. Нажмите «Подключить Google Drive», чтобы начать снова.":
    "Sign-in was not completed within 3 minutes. Click “Connect Google Drive” to start again.",
  "Google Drive не подключён. Войдите в аккаунт с экспортами браслета.":
    "Google Drive is not connected. Sign in with the account that has Bracelet exports.",
  "Сохранённое разрешение Google повреждено. Подключите Drive заново.":
    "Saved Google access is corrupted. Reconnect Drive.",
  "Разрешение Google недействительно. Подключите Drive заново.":
    "Google access is invalid. Reconnect Drive.",
  "Todoist не отдал историю действий за часть выбранного периода. На бесплатном тарифе она доступна только за последние 7 дней.":
    "Todoist did not return activity history for part of the selected period. On the free plan, only the last 7 days are available.",
  "Выберите период в пределах последних 7 дней или проверьте тариф и доступ к истории действий в Todoist.":
    "Select a period within the last 7 days or check your Todoist plan and activity history access.",
  "Todoist отклонил запрос. Проверьте токен и разрешения аккаунта.":
    "Todoist rejected the request. Check the token and account permissions.",
  "Создайте новый API-токен Todoist, обновите TODOIST_API_TOKEN в .env и повторите импорт.":
    "Create a new Todoist API token, update TODOIST_API_TOKEN in .env, and retry the import.",
  "Подождите немного и повторите импорт. Ранее загруженные данные сохранены.":
    "Wait a moment and retry the import. Previously loaded data is preserved.",
  "Папка экспортов браслета не настроена.":
    "The Bracelet exports folder is not configured.",
  "Укажите GOOGLE_DRIVE_FOLDER_ID в .env: это идентификатор папки с экспортами Reva Health Exporter в Google Drive.":
    "Set GOOGLE_DRIVE_FOLDER_ID in .env to the ID of the Google Drive folder containing Reva Health Exporter exports.",
  "Подключите Google Drive.": "Connect Google Drive.",
  ошибка: "error",
  недоступен: "unavailable",
  "нет записей": "no records",
};
