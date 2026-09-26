export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
}
