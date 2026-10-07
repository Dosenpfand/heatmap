# Strava Heatmap
    npm i && npm start        # http://localhost:8080

Open the page and choose (or drop) your Strava export `.zip`. Everything happens in your browser:
a Web Worker reads the zip, parses the GPX/FIT files and builds the heatmap data, which is cached in
IndexedDB so a reload keeps it. The server only serves static files and never receives your data,
so it is safe to host for many people at once.

After editing `src/worker.js`, run `npm run build` (bundles to `public/worker.js`).

Docker:

    docker build -t heatmap . && docker run -p 8080:8080 heatmap
