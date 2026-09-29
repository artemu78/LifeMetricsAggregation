import { t, serverMessage } from "../i18n";
export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message
      ? serverMessage(body.message)
      : t("Ошибка {0}", response.status);
  } catch {
    return t("Ошибка {0}", response.status);
  }
}
