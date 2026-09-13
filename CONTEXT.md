# Live Life

Live Life keeps a private, local view of personal telemetry collected from external sources and makes the trustworthiness of that view visible.

## Language

### Time and scope

**Logical day**:
A reporting interval from 05:00 inclusive until 05:00 exclusive on the following calendar date in Europe/Moscow.
_Avoid_: Calendar day, midnight day

**Current dashboard day**:
The current Moscow calendar date marked as in progress in the dashboard, even when some sources have already run.
_Avoid_: Current logical day, complete day

**Dashboard window**:
The 30 consecutive Moscow dates ending on the current dashboard day and displayed in the calendar.
_Avoid_: Calendar month, reporting month

### Sources and provenance

**Data source**:
One independently collected origin of personal telemetry: Bracelet, Welltory, Todoist, or RescueTime.
_Avoid_: Integration, dataset

**Bracelet**:
The fitness data source populated from Reva Health Exporter files in Google Drive.
_Avoid_: Fitness Drive, Health Connect, local health

**Source run**:
One recorded attempt to obtain a data source's facts for one logical day.
_Avoid_: Data presence, import count

**Source status**:
The outcome of the latest source run for one source and logical day: success, partial, failed, or not run.
_Avoid_: Data count, source availability

**Bracelet export**:
One fitness data file with a stable Google Drive identity, produced by Reva Health Exporter and allowed to be revised or renamed.
_Avoid_: Local health file, Health Connect fallback

**Bracelet synchronization**:
An explicit reconciliation of Bracelet exports in Google Drive with their local source projection for a selected inclusive date range.
_Avoid_: Dashboard refresh, full data synchronization

**Source projection**:
The local, queryable facts derived from a data source while retaining their source identity and provenance.
_Avoid_: Raw payload, source file

**Import record**:
The provenance of one Bracelet export in the local system, including its Drive identity, content fingerprint, availability, and import time.
_Avoid_: Metric event, source run

**Missing Bracelet export**:
A previously known Bracelet export that is no longer present in the requested Google Drive range; its historical facts are retained until explicitly replaced or removed.
_Avoid_: Deleted measurement, failed source run

### Trust and presentation

**Data quality**:
The combined state of source statuses for one logical day; zero activity is valid data and does not imply a missing source.
_Avoid_: Activity level, completeness inferred from row count

**Source availability**:
Whether a source has usable successful or partial results for a logical day.
_Avoid_: Source status, row presence

**Dashboard snapshot**:
A read-only view of source projections and quality for an inclusive date range at one generation time.
_Avoid_: Database dump, synchronization result

**Day detail**:
The user-visible measurements and text associated with one logical day from Bracelet, Welltory, Todoist, and RescueTime; Private Diary is excluded.
_Avoid_: Raw payload, database dump

**Todoist task event**:
The creation or completion of a Todoist task, including the task text and event time.
_Avoid_: Task count, task snapshot

**RescueTime perspective**:
One classification of tracked time as either activity or productivity; the two perspectives describe the same time and are not additive.
_Avoid_: Time category total, combined RescueTime hours

**Private Diary**:
Personal diary text retained locally for private workflows and excluded from every dashboard snapshot and day detail.
_Avoid_: Dashboard source, hidden dashboard field

**Raw source payload**:
Source-specific data retained for provenance or reprocessing but never exposed through the dashboard.
_Avoid_: Day detail, dashboard data
