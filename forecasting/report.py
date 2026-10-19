"""Local human-readable experiment report, never a public telemetry export."""
import json


def render_report(dataset, evaluation):
    counts = {name: sum(v is not None for v in values)
              for name, values in dataset['targets'].items()}
    summary = ['| Target | Method | Validation MAE (n) | Holdout MAE (n) |', '|---|---|---|---|']
    for target, result in evaluation['targets'].items():
        for method, values in result['methods'].items():
            def cell(split):
                metric = values[split]
                return 'unavailable' if metric['mae'] is None else f"{metric['mae']:.2f} ({metric['count']})"
            summary.append(f"| {target} | {method} | {cell('validation')} | {cell('holdout')} |")
    return '\n'.join([
        '# Morning forecast experiment', '',
        '09:00 Europe/Moscow cutoff; assessment near 10:00. Three distinct targets.', '',
        '## Evidence limits', '',
        'This is an exploratory retrospective experiment, not a validated forecast product. '
        'Current mutable projections cannot establish every historical as-of state. '
        'Imported-at filtering is conservative but cannot restore overwritten revisions.', '',
        'No feature group should be declared useful from a small holdout or training fit. '
        'Use the same scored dates and compare against persistence and recent median.', '',
        '## Comparison', '', *summary, '',
        '## Target coverage', '',
        '```json', json.dumps(counts, indent=2), '```', '',
        '## Data suitability and provenance', '',
        '```json', json.dumps(dataset['metadata'], indent=2, allow_nan=False), '```', '',
        '## Evaluation', '',
        '```json', json.dumps(evaluation, indent=2, allow_nan=False), '```', '',
        '## Prospective evaluation', '',
        'Collect separate Welltory and EMA assessments around 10:00, preserving actual '
        'measurement/answer time. Save immutable 09:00 feature snapshots before assessments '
        'arrive. Accumulate at least 8–12 weeks as an initial study-design target, then '
        'evaluate per-target coverage and errors; this duration is not a model requirement. '
        'Keep forecasts and input selection fixed during the final evaluation window. '
        'Do not expand target windows merely to obtain a favorable score.', '',
        '## Integration decision', '',
        'Do not enable dashboard predictions until chronological baseline comparisons '
        'and interval coverage support a useful improvement. Sparse targets remain '
        'insufficient evidence; missing data is not zero.', ''
    ])
