import { useEffect, useRef, useState } from "react";
import type { components } from "../generated/api-types";
import { JSON_HEADERS } from "../shared/sourceConfig";

type Connection = components["schemas"]["DriveConnectionState"];
const CONNECTION_POLL_INTERVAL_MS = 1000;
const MAX_CLIENT_FILE_BYTES = 16 * 1024;
const headers = { ...JSON_HEADERS, "X-Live-Life-Action": "1" };

async function connectionRequest(
  url: string,
  init?: RequestInit,
): Promise<Connection> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "Не удалось связаться с приложением. Повторите действие.",
    );
  }
  return response.json();
}

export function useDriveConnection() {
  const [connection, setConnection] = useState<Connection>({ status: "idle" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  const pending = connection.status === "pending";
  useEffect(() => {
    if (!pending || !connection.sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await connectionRequest(
          `/api/google-drive/connection/${connection.sessionId}`,
        );
        if (cancelled) return;
        setConnection(next);
        if (next.status === "pending")
          timer = setTimeout(poll, CONNECTION_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        setConnection({ status: "failed" });
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить подключение.",
        );
      }
    };
    timer = setTimeout(poll, CONNECTION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, connection.sessionId]);

  async function connect() {
    const current = ++sequence.current;
    setBusy(true);
    setMessage(null);
    try {
      const next = await connectionRequest("/api/google-drive/connect", {
        method: "POST",
        headers,
      });
      if (current === sequence.current) setConnection(next);
    } catch (error) {
      if (current === sequence.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось начать подключение.",
        );
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }

  async function upload(file: File) {
    const current = ++sequence.current;
    setMessage(null);
    if (file.size > MAX_CLIENT_FILE_BYTES) {
      setMessage(
        "Файл слишком большой. Выберите JSON OAuth-клиента типа Desktop app, скачанный из Google Cloud.",
      );
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      if (current !== sequence.current) return;
      const next = await connectionRequest("/api/google-drive/client", {
        method: "POST",
        headers,
        body: JSON.stringify({ content }),
      });
      if (current !== sequence.current) return;
      setConnection(next);
      if (next.status !== "failed")
        setMessage(
          "Настройки сохранены на этом компьютере. Теперь подключите Google Drive.",
        );
    } catch (error) {
      if (current === sequence.current)
        setMessage(
          error instanceof Error ? error.message : "Не удалось сохранить файл.",
        );
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }

  return { connection, message, busy, pending, connect, upload };
}
