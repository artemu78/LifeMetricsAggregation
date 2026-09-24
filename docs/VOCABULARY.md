# Live Life Vocabulary

Use these canonical terms when discussing the domain, naming user-visible concepts, and writing project documentation.

## Time and scope

**Logical day**:
A reporting interval for work, tasks, activity, and other effort-related measurements from 05:00 inclusive until 05:00 exclusive on the following calendar date in Europe/Moscow. Bracelet sleep and steps use their own attribution rules instead.
_Avoid_: Calendar day, midnight day

**Step calendar date**:
The Europe/Moscow calendar date on which a Bracelet step interval starts. All canonical intervals starting from 00:00 inclusive until 00:00 exclusive on the next date contribute to that date's step total.
_Avoid_: Step logical day, effort date

**Canonical step interval**:
The latest Bracelet export revision for one data origin and step interval. When overlapping exports contain different counts for the same interval, only the revision from the most recently modified export contributes to the total.
_Avoid_: All step records, duplicate interval

**Sleep wake date**:
The Europe/Moscow calendar date on which the main sleep session ends. The complete session belongs to this date even when it starts before the logical-day boundary.
_Avoid_: Sleep logical day, stage date

**Main sleep session**:
The longest Bracelet sleep session ending on a sleep wake date. Its duration is the sum of non-awake stages; shorter sessions on the same date are treated as naps.
_Avoid_: All daily sleep, logical-day sleep

**Current dashboard day**:
The current Moscow calendar date marked as in progress in the dashboard, even when some sources have already run.
_Avoid_: Current logical day, complete day

**Dashboard window**:
The consecutive Moscow dates ending on the current dashboard day and displayed in the calendar. It starts on the latest Monday that keeps at least 28 dates in the inclusive range.
_Avoid_: Calendar month, reporting month

## Sources and provenance

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

**Dashboard source synchronization**:
An explicit attempt to update every data source shown in the dashboard for a selected inclusive date range. It synchronizes Bracelet exports, imports available Welltory files, and collects Todoist and RescueTime; it does not include Private Diary.
_Avoid_: Bracelet synchronization, page refresh

**Source projection**:
The local, queryable facts derived from a data source while retaining their source identity and provenance.
_Avoid_: Raw payload, source file

**Import record**:
The provenance of one Bracelet export in the local system, including its Drive identity, content fingerprint, availability, and import time.
_Avoid_: Metric event, source run

**Missing Bracelet export**:
A previously known Bracelet export that is no longer present in the requested Google Drive range; its historical facts are retained until explicitly replaced or removed.
_Avoid_: Deleted measurement, failed source run

## Trust and presentation

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

**Ход дня**:
A popup with a shared timeline of saved measurements and events for one logical day, shown in the dashboard timezone. It has separate tracks for EMA and Todoist events, alongside Bracelet pulse, steps, and workouts, RescueTime activity and productivity, and Welltory measurements; sleep and wake boundaries appear when they fall within the logical day.
_Avoid_: Calendar-day timeline, complete personal history

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
