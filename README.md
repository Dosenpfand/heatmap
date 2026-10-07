# Activity Heatmap

    npm ci && npm run dev     # builds, then serves http://localhost:8080

Open the page and choose (or drop) your activity export `.zip`. Everything happens in your browser:
a Web Worker reads the zip, parses the GPX/FIT files and builds the heatmap data, which is cached in
IndexedDB so a reload keeps it. The server only serves static files and never receives your data,
so it is safe to host for many people at once.

## Development

| Command             | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `npm run build`     | Bundle `src/app.js`, `src/worker.js`, `src/style.css` to `public/` (esbuild) |
| `npm start`         | Serve `public/`                                                              |
| `npm test`          | Unit tests (`node:test`, no extra dependencies)                              |
| `npm run typecheck` | `tsc` over the JSDoc-typed sources (strict `checkJs`)                        |
| `npm run test:e2e`  | Browser smoke test (Playwright; first run `npx playwright install chromium`) |
| `npm run lint`      | ESLint                                                                       |
| `npm run format`    | Prettier (`format:check` to verify)                                          |
| `npm run check`     | Format check, lint, typecheck and tests (what CI runs)                       |

Layout:

- `src/lib/` – pure, tested logic: zip reader, GPX/FIT parsing, simplification, dataset format, track
  projection, IndexedDB store, colormaps, tiles, selection math, WebM muxer.
- `src/app.js` – entry point; wires the modules below together.
- `src/state.js`, `src/settings.js`, `src/dom.js` – app state, values derived from the controls, typed element refs.
- `src/map.js` (canvas view, pan/zoom, selection), `src/heat.js` (heat rendering), `src/tile-cache.js`.
- `src/export-image.js`, `src/export-video.js`, `src/video-sinks.js` – PNG and animation export.
- `src/controls.js`, `src/import.js` – settings panel and zip import; `src/worker.js` – import worker.
- `src/style.css` – styles. `public/index.html` is the only hand-written file in `public/`; the rest is build output.

Docker:

    docker build -t heatmap . && docker run -p 8080:8080 heatmap

or `docker compose up --build`.

Set `DEFAULT_API_KEY` (e.g. `docker run -e DEFAULT_API_KEY=... `, or in the environment of `docker compose`/`npm start`) to
provide a default basemap key. It is not shown in the UI; entering a key in the "API key" field overrides it.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Strava. "Strava" is a trademark of Strava, Inc.
