# Live Life

Live Life keeps a private, local view of personal telemetry collected from external sources and makes the trustworthiness of that view visible.

## Language

**Logical day**:
A reporting interval from 05:00 inclusive until 05:00 exclusive on the following calendar date in Europe/Moscow.
_Avoid_: Calendar day, midnight day

**Source run**:
One recorded attempt to obtain a source's data for one logical day, including whether it succeeded, was partial, failed, or was not attempted.
_Avoid_: Data presence, import count

**Data quality**:
The combined state of source runs for a logical day; vested activity such as zero completed tasks is valid data and is not a missing source.
_Avoid_: Activity level, completeness inferred from row count

**Bracelet export**:
One immutable or revised fitness data file owned by Google Drive and produced by Reva Health Exporter.
_Avoid_: Local health file, Health Connect fallback

**Dashboard window**:
The 30 consecutive Moscow dates ending on the current date and displayed in the calendar.
_Avoid_: Calendar month

**Day detail**:
The user-visible measurements and text associated with one logical day from Bracelet, Welltory, Todoist, and RescueTime; Diary is excluded.
_Avoid_: Raw payload, database dump

**Import record**:
The local provenance of a bracelet export, including its remote identity, content fingerprint, status, and import time.
_Avoid_: Metric event
