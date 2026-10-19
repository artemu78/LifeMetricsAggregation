# Morning forecasting experiment

Isolated implementation of [issue #28](https://github.com/artemu78/LifeMetricsAggregation/issues/28).
At **09:00 Europe/Moscow**, estimate **10:00 Welltory Energy(HRV), EMA mood and EMA energy** separately. This module does not modify the dashboard, synchronize sources, or read diary/task/EMA free text.

## Reproduce

Run from the repository root. Python 3.12 was used; the lock records exact dependency versions. The environment is independent of the dashboard.

```sh
uv --cache-dir forecasting/.cache/uv venv --python python3.12 forecasting/.venv
uv --cache-dir forecasting/.cache/uv pip sync --python forecasting/.venv/bin/python forecasting/requirements.lock
forecasting/.venv/bin/python -m forecasting download
forecasting/.venv/bin/python -m forecasting smoke
forecasting/.venv/bin/python -m pytest forecasting/tests -q
forecasting/.venv/bin/python -m forecasting inventory
forecasting/.venv/bin/python -m forecasting evaluate
```

The explicit download retrieves the revision in `config.json`; inference uses local files only. Code is pinned in `requirements.lock`. Upstream code is Apache-2.0; model weights use [Modified MIT](https://huggingface.co/mistralai/Timestral-209M/blob/main/LICENSE). No fine-tuning is performed. CPU inference uses four threads by default.

Models, environments, datasets and reports are ignored by Git. Outputs are private local files under `forecasting/outputs/`; do not attach these to GitHub. `--output` allows separate experiment directories.

For an OS-enforced offline run on macOS after installation/download:

```sh
sandbox-exec -p '(version 1)(allow default)(deny network*)' forecasting/.venv/bin/python -m forecasting smoke
sandbox-exec -p '(version 1)(allow default)(deny network*)' forecasting/.venv/bin/python -m forecasting evaluate
```

The runtime additionally blocks Python socket connections and disables Hugging Face online access/telemetry. That Python guard alone is not a native-code firewall. The macOS profile denies network operations for the whole subprocess.

## Data and time contract

- `dataset.build_dataset` opens SQLite in read-only/query-only mode, with a consistent read transaction. It does not use the application's schema-maintaining connection helper.
- One row per consecutive Moscow calendar date; this is an explicit model grid, not a change to the dashboard logical day. Prior-24-hour features are named as rolling windows. Steps use their calendar date; main sleep uses its wake date.
- Labels are the nearest actual observation to 10:00 within ±30 minutes, earlier observation wins a tie. EMA uses `answered_at`; missing or partial labels stay missing. Offset lists are reported. Use `--window-minutes 15` for a tighter sensitivity run.
- Feature rows contain only measurements/complete intervals at or before 09:00. The same row's features are therefore known covariates for its 10:00 target. This does not mean tomorrow's actual sensor data is known today.
- Retrospective mode filters by event time. `--availability strict` also filters recorded import times. Mutable source projections cannot reconstruct overwritten revisions; strict mode is a conservative availability proxy, not a historical archive.
- Structured inputs and reasons for exclusions are described by the local inventory. Missingness and measurement age are retained; ordinary pulse is never relabeled resting pulse. Welltory energy and EMA energy remain different constructs.

## Bounded evaluation

Default budget: 12 shared chronological origins, at least eight observed training labels per target, at most 20 joint variants and four separate-target calls per origin. No parameter grid or fine-tuning. Three targets ordinarily use fewer than the maximum 288 calls.

Comparisons include persistence, median of the latest seven observed labels, fixed-penalty ridge, Timestral history only, each input group, all groups, leave-one-group-out, and separate-target history. Variants are fixed before scoring. Features are not selected using holdout outcomes. Ridge imputation and scaling use training rows only. EMA point estimates and quantiles are clipped to [1,5], not rounded.

Each target reserves the last seven calendar days ending at its latest eligible assessment as holdout; sparse targets may have very few holdout observations. Reports show validation and holdout separately. Comparable metrics use the intersection of successful dates for all methods, with independent available-date metrics shown separately. Quantile intervals report their actual nominal probability; sparse coverage is descriptive, not calibrated certainty.

```sh
forecasting/.venv/bin/python -m forecasting evaluate --baselines-only
forecasting/.venv/bin/python -m forecasting evaluate --availability strict --output forecasting/outputs/strict
forecasting/.venv/bin/python -m forecasting evaluate --window-minutes 15 --output forecasting/outputs/window15
```

A target can be insufficient even while others run. More high-frequency sensor rows do not create additional morning labels. Do not widen windows or lower training thresholds to turn a smoke test into an accuracy claim.

## Module layout and future use

- `dataset.py`: source adapter, cutoff-safe features, labels, coverage and provenance.
- `model.py`: explicit download, offline Timestral adapter, synthetic smoke test.
- `evaluation.py`: chronological baselines and bounded model experiments.
- `contract.py`: reusable forecast-result envelope with explicit insufficient-data state.
- `report.py`: private local report and prospective study guidance.
- `__main__.py`: command-line entry point; `config.json`: model pins and default experiment budget.

Before production integration, save immutable 09:00 input snapshots and collect consistent 10:00 assessments with actual timestamps. An initial 8–12-week collection period is a study-design suggestion, not a model requirement. Verify baseline improvement and interval coverage on prospective held-out observations before enabling dashboard forecasts.

## Reconstruct a specific morning

```sh
sandbox-exec -p '(version 1)(allow default)(deny network*)' forecasting/.venv/bin/python -m forecasting predict --date 2026-10-19 --availability strict --output forecasting/outputs/morning-2026-10-19
```

This uses the predeclared all-input variant, not a model selected from today's outcome. The requested date's labels never enter the context. The grid extends through the requested date so features reflect its 09:00 cutoff even when the latest imported measurement is older. `quality` includes training-label count, last target date, available feature count and historical availability limitations. Predictions generated after assessment time are explicitly marked reconstructed. Missing targets retain `insufficient_data`; no fallback numeric estimate is fabricated.

The initial local run completed 102 real-model calls without model failures. It demonstrated that the pipeline runs, but the available morning labels are too sparse to justify deployment; adding all structured inputs did not establish an improvement over simple baselines. Detailed private measurements and model errors are only in ignored output reports. The offline smoke test used about 1.75 GB peak process RSS; downloaded checkpoint files total about 837 MB. Agent billing was not available, so no monetary cost estimate is claimed.

## Predict tomorrow with one command

From the repository root:

```sh
./forecasting/scripts/predict-tomorrow.sh
```

The script works from any working directory when invoked by its absolute path. It prints **Welltory energy, EMA mood, and EMA energy** for tomorrow at **10:00 Europe/Moscow**, with model intervals or an explicit insufficient-history result. It saves `forecasting/outputs/prediction-YYYY-MM-DD.json` locally. Optional CLI flags such as `--threads 2` and `--output forecasting/outputs/my-run` are forwarded.

Tomorrow is calculated from the current Moscow date. This is a forecast made **now**, not a reconstruction of tomorrow's 09:00 forecast: no future sleep, measurements or not-yet-imported observations enter the inputs. Tomorrow's features are capped at the actual run time; unfinished intervals are excluded, and some current-day aggregates may be partial. This advance-forecast policy has not been separately backtested or calibrated. The existing morning-only label requirement remains; it does not invent EMA estimates when history is insufficient.

The command reads the existing local database without synchronizing sources. Refresh sources through the normal application workflow first when needed. On macOS the script enforces network denial with `sandbox-exec`; elsewhere the runtime's documented Python-level guard applies.

For a fresh installation only, run `./forecasting/scripts/setup.sh` once to create the isolated environment, install locked dependencies, and download the pinned checkpoint. The installed environment and checkpoint in this workspace are already ready.
