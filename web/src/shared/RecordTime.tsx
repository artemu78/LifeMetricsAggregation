import { formatRecordTime } from "../dayDetail";

export function RecordTime({
  timestamp,
  timezone,
}: Readonly<{
  timestamp: string;
  timezone: string;
}>) {
  return (
    <time dateTime={timestamp}>{formatRecordTime(timestamp, timezone)}</time>
  );
}
