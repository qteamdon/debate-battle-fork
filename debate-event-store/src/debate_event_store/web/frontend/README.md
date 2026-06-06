# Live Debate Frontend

Vite + React + TypeScript + MobX + tsyringe SPA.

## Build

```bash
npm install
npm run build
```

The build emits to `../static/dist/` so the Python package (`debate_event_store.web`) can mount the bundle via `StaticFiles(directory=.../web/static/dist, html=True)`.

## Dev

```bash
npm run dev
```

Vite serves at `http://localhost:5173` and proxies `/api/*` to `http://127.0.0.1:8770`. Start the MCP server (or call `debate_visualize`) first to get the backend running.

## Layout

- `src/main.tsx` — bootstraps DI container and React root. `reflect-metadata` must remain the first import.
- `src/lib/di.ts` — `configureContainer(container)` registers all singletons.
- `src/tsyringe-hooks/` — verbatim copy of colorsquare's ContainerContext/ContainerProvider/useContainer/useResolve.
- `src/services/` — `SseClient`, `DebateApi`.
- `src/stores/` — global stores (e.g. `ConnectionStore`).
- `src/views/<Pane>/` — co-located `*Store.ts` viewmodel + `*View.tsx` view, MVVM per phase.
