import { formatRecordTime } from "../dayDetail";

export function RecordTime({
  timestamp,
  timezone,
}: {
  timestamp: string;
  timezone: string;
}) {
  return (
    <time dateTime={timestamp}>{formatRecordTime(timestamp, timezone)}</time>
  );
}
