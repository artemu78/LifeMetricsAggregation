# Live Life

Local-first collection and daily reporting for Welltory, RescueTime, Todoist,
Google Drive fitness exports, and diary entries. Imported data stays on this Mac
in `data/life.db`; the raw fitness source remains in Google Drive.

The reporting day defaults to **05:00 through 04:59 Europe/Moscow**, so activity
after midnight belongs to the day that began the previous morning.

## Quick start

```bash
cd "/Users/artemreva/MyLocalDocuments/live_life"
python3 -m live_life init-db
python -m live_life authorize-fitness-drive
python3 -m live_life import-welltory
python3 -m live_life report
```

`report` defaults to the most recently completed logical day. Reports are saved
under `reports/YYYY-MM-DD.md`.

## API setup

Copy `.env.example` to `.env` and fill in the two tokens. Keep `.env` private.

- RescueTime: create a personal API key in RescueTime's API Key Management page.
- Todoist: Settings -> Integrations -> Developer -> API token.

Then run:

```bash
python3 -m live_life run-daily
```

The command downloads and imports the relevant fitness exports from Google
Drive, imports every Welltory CSV found in Downloads (duplicate rows are
ignored), fetches RescueTime and Todoist when tokens are configured, imports
drop-folder data, and creates the daily report.

## Fitness tracker from Google Drive

The source of truth is the configured Google Drive folder:

`https://drive.google.com/drive/folders/1HkjtMrBa8hv_LPbtYbyIUXfxgUVfsfNO`

Exports are discovered under `year/month/day` folders. The importer also accepts
the current `year/month/files` layout. It downloads only new or changed Reva
Health Exporter schema-v1 JSON files into the ignored local cache
`data/inbox/fitness_drive/`, then imports Steps, Heart rate, Sleep, Distance,
Calories, Exercise, Resting heart rate, and Oxygen saturation.

One-time setup:

1. In Google Cloud, create a Desktop OAuth client with Drive API access.
2. Save its downloaded JSON as `private/google-drive-client-secret.json`.
3. Install the project and authorize read-only Drive access:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
python3 -m live_life authorize-fitness-drive
```

The renewable OAuth token is stored in the ignored `data/google-drive-token.json`.
Routine `run-daily`, `backfill`, and `form_reports.py` runs sync Drive automatically.

## Drop folders

Run `python3 -m live_life init-db` once to create these folders:

- `data/inbox/diary/YYYY-MM-DD.md` for diary text. The scheduled Codex task
  reads the dated section for that day from the Google Doc **personal diary**
  and writes this local snapshot automatically. The daily report records only
  that an entry was imported; it never repeats the diary text.
- `data/inbox/health/*.csv` is retained for legacy Health Sync exports. Files for
  **Steps**, **Heart rate**, and **Sleep** can be copied here unchanged; their
  native `Date,Time,...` CSV layout is detected automatically.
- `data/inbox/health/*.csv` for generic health rows with columns
  `timestamp,metric,value,unit`.
- `data/inbox/health_connect/` for Health Connect exports. These are archived
  for now; parsing will be added after inspecting a real export ZIP.

## Welltory browser step

Welltory has no documented personal API for this export. The scheduled Codex
task should open `https://app.welltory.com/dashboard`, open the **Stress (HRV)**
chart, and click **Export**. `run-daily` then finds and imports the CSV from
Downloads. Exporting a rolling range is safe because imports are idempotent.

## Commands

```text
python3 -m live_life init-db
python3 -m live_life authorize-fitness-drive
python3 -m live_life sync-fitness-drive [--from YYYY-MM-DD --to YYYY-MM-DD]
python3 -m live_life import-welltory [CSV ...]
python3 -m live_life collect-rescuetime [--date YYYY-MM-DD]
python3 -m live_life collect-todoist [--date YYYY-MM-DD]
python3 -m live_life import-inbox
python3 -m live_life report [--date YYYY-MM-DD]
python3 -m live_life run-daily [--date YYYY-MM-DD]
python3 -m live_life backfill --from YYYY-MM-DD --to YYYY-MM-DD
python3 -m live_life export-rescuetime --from YYYY-MM-DD [--to YYYY-MM-DD] [--output-dir DIR]
```

`export-rescuetime` writes one chronological CSV per logical day (05:00–05:00
in the configured timezone). It keeps the raw interval rows and includes both
the activity and productivity perspectives in separate columns. The two
perspectives are duplicate classifications of the same time and must not be
summed together.

After a long gap, refresh the diary snapshots and then run `backfill`. It syncs
the relevant Google Drive fitness months, imports Welltory and inbox files once,
downloads RescueTime and Todoist for every logical day in the inclusive range,
and regenerates all matching reports. Re-running the same range is safe.

For the routine catch-up, run the single script:

```bash
python3 form_reports.py
```

It finds the latest `reports/YYYY-MM-DD.md`, regenerates that day because its
data may have been incomplete, and then creates every report through today's
date (inclusive). It uses the configured timezone and can be run from any
working directory.

If an input system is unavailable (for example, a missing API token, failed
network request, unavailable Google Drive authorization, or missing Welltory
export), the script lists the problems and asks before generating reports with
partial data. Only an explicit `y` or `yes` continues. A non-interactive run
stops with exit status 2 instead of waiting for input.

This is a self-observation tool, not a medical diagnosis system.
