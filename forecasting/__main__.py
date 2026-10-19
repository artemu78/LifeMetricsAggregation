"""Run from repository root: python -m forecasting --help."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time
import uuid

ROOT = Path(__file__).resolve().parent


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def main():
    config = json.loads((ROOT / 'config.json').read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['download', 'smoke', 'inventory', 'evaluate', 'predict', 'tomorrow'])
    parser.add_argument('--date', help='Forecast date YYYY-MM-DD; required for predict')
    parser.add_argument('--database', type=Path, default=ROOT.parent / 'data/life.db')
    parser.add_argument('--model-dir', type=Path, default=ROOT / 'models/Timestral-209M')
    parser.add_argument('--output', type=Path, default=ROOT / 'outputs')
    parser.add_argument('--availability', choices=['retrospective', 'strict'], default='retrospective')
    parser.add_argument('--window-minutes', type=int, default=config['window_minutes'])
    parser.add_argument('--max-origins', type=int, default=config['max_origins'])
    parser.add_argument('--min-train-labels', type=int, default=config['min_train_labels'])
    parser.add_argument('--holdout-days', type=int, default=config['holdout_days'])
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--baselines-only', action='store_true')
    args = parser.parse_args()
    as_of = None
    if args.command == 'tomorrow':
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo('Europe/Moscow'))
        as_of = now.isoformat()
        args.date = (now.date() + timedelta(days=1)).isoformat()
        args.availability = 'strict'
    if args.command == 'predict' and not args.date:
        parser.error('--date is required for predict')
    if args.command == 'download':
        from .model import download_model
        result = download_model(args.model_dir)
        save(args.output / 'download.json', result)
        print('Pinned model downloaded; manifest saved locally.')
        return
    if args.command == 'smoke':
        from .model import smoke_test
        result = smoke_test(args.model_dir, threads=args.threads)
        save(args.output / 'smoke.json', result)
        print(json.dumps(result, indent=2))
        return
    from .dataset import build_dataset
    before = hashlib.sha256(args.database.read_bytes()).hexdigest()
    started = time.monotonic()
    dataset = build_dataset(args.database, window_minutes=args.window_minutes, availability=args.availability,
                            through_date=args.date if args.command in {'predict', 'tomorrow'} else None, as_of=as_of)
    after = hashlib.sha256(args.database.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError('Source database changed during read; rerun without concurrent synchronization.')
    save(args.output / 'dataset.json', dataset)
    save(args.output / 'inventory.json', dataset['metadata'])
    if args.command == 'inventory':
        print('Local dataset and inventory saved; source database unchanged.')
        return
    if args.command in {'predict', 'tomorrow'}:
        from .predict import predict_morning
        from .model import LocalTimestral, deny_network
        with deny_network():
            model = LocalTimestral(args.model_dir, threads=args.threads)
            result = predict_morning(dataset, args.date, model, config['model']['revision'], args.min_train_labels, as_of=as_of)
        save(args.output / ('prediction-' + args.date + '.json'), result)
        print(f"Assessment: {args.date} 10:00 Europe/Moscow")
        for item in result['results']:
            label = {'welltory.energy': 'Welltory energy', 'ema.mood': 'EMA mood', 'ema.energy': 'EMA energy'}[item['target']]
            if item['point'] is None:
                print(f"{label}: insufficient history ({item['quality']['training_labels']} morning labels)")
            else:
                q = item['quantiles']
                print(f"{label}: {item['point']:.1f} {item['unit'] or ''}; model 80% interval {q['0.1']:.1f}–{q['0.9']:.1f}")
        print('Experimental, uncalibrated forecast. Results: ' + str(args.output / ('prediction-' + args.date + '.json')))
        return
    from .evaluation import evaluate
    from .model import LocalTimestral, deny_network
    with deny_network():
        model = None if args.baselines_only else LocalTimestral(args.model_dir, threads=args.threads)
        result = evaluate(dataset, forecaster=model, max_origins=args.max_origins,
                          min_train_labels=args.min_train_labels, holdout_days=args.holdout_days)
    result['run'] = {'id': str(uuid.uuid4()), 'elapsed_seconds': time.monotonic() - started,
                     'model': config['model'], 'availability': args.availability,
                     'window_minutes': args.window_minutes, 'database_sha256': before,
                     'source_database_unchanged': True}
    save(args.output / 'evaluation.json', result)
    from .report import render_report
    (args.output / 'report.md').write_text(render_report(dataset, result))
    print('Evaluation finished. Private results: ' + str(args.output / 'report.md'))


if __name__ == '__main__':
    main()
