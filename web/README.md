# Dashboard frontend

The domain terminology and data boundaries are defined in [VOCABULARY.md](../docs/VOCABULARY.md).

- `src/App.tsx` defines routes. Day details and their chart dependencies load on demand.
- `src/dashboard/` composes the calendar, day dialog, and source panels.
- `src/timeline/` prepares the shared timeline and renders its individual tracks. Viewport, cursor, and selection hooks own their respective browser interactions.
- `src/sleep/` separates interval normalization, curve geometry, axes, and hover rendering.
- `src/synchronization/` contains synchronization feedback and Google Drive recovery UI.
- `src/shared/` holds shared presentation constants, duration formatting, source labels, and modal behavior.
- `src/store.ts` coordinates dashboard loading and synchronization; `src/sync.ts` handles the response stream.

Chart preparation is memoized by snapshot inputs. Replace dashboard snapshots when new data arrives; do not mutate chart input arrays in place. Pointer movement updates cursor/selection state without rebuilding timeline records or sleep paths.

Keep chart dimensions and visual thresholds in their feature's configuration module. Shared time units and display scales live in `src/shared/`. Preserve the distinctions between missing data and zero, sleep wake dates, step calendar dates, and logical days. RescueTime perspectives describe the same time and must not be added together.

Run the frontend checks from this directory:

```sh
npm run check:types
npm run test:coverage
npm run build
```

Tests use synthetic data and cover source summaries, stream handling, stale request races, connection recovery, modal keyboard/focus behavior, chart interactions, and snapshot replacement.
