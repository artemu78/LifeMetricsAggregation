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
under `data/reports/YYYY-MM-DD.md`.

## API setup

Copy `.env.example` to `.env` and configure your sources using the documented variables. Keep `.env` private.

- RescueTime: create a personal API key in RescueTime's API Key Management page.

RescueTime fetch diagnostics are appended to `data/logs/rescuetime.jsonl`
(git-ignored, created with owner-only access). Each request records its logical
date, taxonomy, start/end time, elapsed duration, and sanitized failure stage,
error type, and HTTP status when available. Credentials, request URLs, and
activity contents are never logged. `collection_saved` is written only after
the day's database transaction commits. A `connection_or_response` timeout
means no response was obtained; it can include DNS, TCP, TLS, or waiting for
response headers. `decode_json` identifies response reading/JSON decoding;
`validate_payload` identifies an unexpected response structure. The error
shown by the report runner includes the log location. Logs append across runs;
the file can be deleted when no longer needed. Fetch failures still require
approval before partial reports are generated.
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

`GOOGLE_DRIVE_FOLDER_ID` in `.env`

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

The renewable OAuth token is stored in the ignored `private/google-drive-token.json`.
Routine `run-daily`, `backfill`, and `form_reports.py` runs sync Drive automatically.

## Drop folders

Run `python3 -m live_life init-db` once to create these folders:

- `data/inbox/diary/YYYY-MM-DD.md` for manual diary imports when
  `DIARY_GOOGLE_DOC_ID` is empty. With a Google Doc configured, local diary
  snapshots are ignored so stale copies cannot overwrite direct imports.
  Reports record only whether an entry exists, never its text.
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

After a long gap, run `form_reports.py` to refresh the Google diary, then use
`backfill` if older reports also need rebuilding. It syncs
the relevant Google Drive fitness months, imports Welltory and inbox files once,
downloads RescueTime and Todoist for every logical day in the inclusive range,
and regenerates all matching reports. Re-running the same range is safe.

For the routine catch-up, run the single script:

```bash
python3 form_reports.py
```

It finds the latest `data/reports/YYYY-MM-DD.md`, regenerates that day because its
data may have been incomplete, and then creates every report through today's
date (inclusive). It uses the configured timezone and can be run from any
working directory.

If an input system is unavailable (for example, a missing API token, failed
network request, unavailable Google Drive authorization, or missing Welltory
export), the script lists the problems and asks before generating reports with
partial data. Only an explicit `y` or `yes` continues. A non-interactive run
stops with exit status 2 instead of waiting for input.

This is a self-observation tool, not a medical diagnosis system.

## Local dashboard

The private dashboard shows at least 28 Moscow dates ending today in a calendar,
with the displayed range always starting on a Monday.
It reads Bracelet, Welltory, Todoist, and RescueTime data from the local
database. Diary content is never selected by the dashboard API. The server
binds only to `127.0.0.1`.

Build and start it:

```bash
source .venv/bin/activate
npm install
npm run build
live-life-dashboard
```

Open `http://127.0.0.1:8000`. The **Update bracelet data** action synchronizes
only Google Drive bracelet exports for the displayed range. Dashboard reads do
not update the database.

`openapi.yaml` is the sole API contract. Regenerate the checked-in Python and
TypeScript types after changing it:

```bash
datamodel-codegen
npm run generate:types
```

The API starts the JSON workers as separate processes:

- `python -m live_life.dashboard_json --from YYYY-MM-DD --to YYYY-MM-DD`
- `python -m live_life.fitness_sync_json --from YYYY-MM-DD --to YYYY-MM-DD`

Successful worker output is one JSON document on stdout; diagnostics use stderr.

## Diary directly from Google Docs

`form_reports.py` now fetches the configured document on every run through the
Google Drive API, splits its dated sections, and imports them into the local
`journal_entries` table before generating reports. No browser or manual export
is needed. The document ID is set with `DIARY_GOOGLE_DOC_ID` in `.env`.

For this Mac, the OAuth client and renewable token already exist, and live
read access has been verified. Run:

```bash
cd /Users/artemreva/MyLocalDocuments/live_life
source .venv/bin/activate
python3 form_reports.py
```

The virtual environment is required because the default system Python does
not currently have the Google libraries. On a fresh installation, install them
with `python3 -m pip install -e .` inside the activated environment.

The diary reuses `private/google-drive-client-secret.json` and
`private/google-drive-token.json`, configured through `GOOGLE_DRIVE_CLIENT_SECRET_FILE` and
`GOOGLE_DRIVE_TOKEN_FILE` in `.env`. No additional
API, credential file, document sharing, or OAuth scope is needed. If access is
revoked, run `python3 -m live_life authorize-fitness-drive` in the activated
environment and sign in with an account that can read the diary. This existing
command authorizes both fitness exports and diary reads.

Keep date headings on separate lines, in `D.M.YYYY` or `YYYY-MM-DD` format
(optional Markdown heading markers are accepted). Text before the first date
is ignored; repeated dates are combined. Dates are explicit diary dates and
are not shifted by the 05:00 telemetry boundary. Blank sections are not entries.
The Drive plain-text export reads the document's first tab; keep the diary in
that tab. Selecting arbitrary tabs is not supported. Google limits this export
to 10 MB: https://developers.google.com/workspace/drive/api/guides/manage-downloads

All dated sections are refreshed in the database. Edits replace previous text;
entries removed from this document are removed from its previous import.
Other-source rows on other dates are preserved. Existing local entries on matching
dates are replaced by Google Doc entries. Report regeneration still covers the
latest existing report through today; use `backfill` for older report dates.
Only `form_reports.py` performs the new direct diary fetch; other CLI commands
use the last imported diary state.

Network, OAuth, export, and unrecognized-date errors use the existing unavailable
source approval gate. Failed fetches/parsing preserve the previous diary import;
reports require explicit approval to continue with unavailable sources.
Private diary text is stored only in the ignored local database, not terminal
summaries or daily reports. Tests use synthetic text; live verification used a
temporary database and did not regenerate normal reports.

Google settings are listed in `.env.example`. Copy the example to `.env` only
for a fresh installation; edit the existing `.env` on this Mac. Set
`GOOGLE_DRIVE_CLIENT_SECRET_FILE`, `GOOGLE_DRIVE_TOKEN_FILE`,
`GOOGLE_DRIVE_FOLDER_ID`, and `DIARY_GOOGLE_DOC_ID` there. Existing shell
environment variables take precedence over `.env`. Credential paths accept
project-relative paths, absolute paths, and `~/`. Actual OAuth secrets remain
in the ignored JSON files. The cache location uses `GOOGLE_DRIVE_CACHE_DIR` in `.env`.

All source setup is in `.env` (see `.env.example`):

| Source | Environment settings |
| --- | --- |
| Todoist | `TODOIST_API_TOKEN`, optional `TODOIST_API_BASE_URL` |
| RescueTime | `RESCUETIME_API_KEY`, optional `RESCUETIME_API_URL` |
| Google Drive / diary | `GOOGLE_DRIVE_CLIENT_SECRET_FILE`, `GOOGLE_DRIVE_TOKEN_FILE`, `GOOGLE_DRIVE_FOLDER_ID`, `DIARY_GOOGLE_DOC_ID`, `GOOGLE_DRIVE_CACHE_DIR` |
| Welltory CSV exports | `WELLTORY_DOWNLOADS_DIR`, `WELLTORY_FILE_PATTERN` |
| Optional local diary imports | `SOURCE_INBOX_DIR` (contains `diary/`) |

Only timezone, logical day boundary, database, and report destination remain
in `config.toml`. Source paths support relative, absolute, and `~/` locations.
Blank optional endpoint/path settings use the defaults shown in `.env.example`.
Welltory still requires a CSV export; this does not add a Welltory API login.
Google API discovery and the read-only OAuth scope remain protocol constants.

Local health CSV and Health Connect ZIP inbox handling has been retired.
Fitness reports use only Google Drive exports, without a local-health fallback.
Historical local health files and database records are retained but not imported
or included in new report summaries.
