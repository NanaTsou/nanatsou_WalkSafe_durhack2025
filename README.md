# SafePath UK POC

Proof of concept web application that helps international students in the UK find safer journeys home by overlaying crime hot spots on a city map, surfacing trustworthy points of interest, and highlighting the relative risk of each path segment.

## Project structure

```
frontend/   # Svelte + Vite mobile-first web client
backend/    # Node.js Express API and data processing helpers
```

## Getting started

> The environment used to author this POC is offline. Run the following commands locally to install dependencies.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available on `http://localhost:5173`.
The interface uses the Svelte Material UI (MUI) component suite for form controls and sliders. Environment variables can be provided via a `.env` file in the `frontend/` directory:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key
VITE_BACKEND_URL=http://localhost:4000
```

### Backend

```bash
cd backend
npm install
npm run start
```

Configure the backend with a `.env` file:

```
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key
ALLOWED_ORIGINS=http://localhost:5173
```

The backend exposes endpoints for heatmap tiles, POI overlays, pathfinding, telemetry, and search proxying.

### Supabase schema bootstrap

1. Enable the SQL function helper used by the seed script:

   ```sql
   create or replace function public.execute_sql(sql text)
   returns void
   language plpgsql
   security definer set search_path = public as $$
   begin
     execute sql;
   end;
   $$;
   ```

2. Run the seed script to create required tables:

   ```bash
   cd backend
   npm run seed
   ```

### Crime data processing workflow

1. Download the UK police CSV exports (columns: `lat, lon, year-month, crime category, resolution`) and place them under `backend/data/raw/`.
2. Execute the processing script to aggregate per-grid statistics that power the heatmap:

   ```bash
   node backend/scripts/processCrimeData.js
   ```

   The script enriches each record with a risk score, aggregates incidents by location, time period, and category, then stores the results in `backend/data/processed/heatmap.json`. Upload the same JSON to the `heatmap_points` table if you prefer serving heatmap data directly from Supabase.

## Key features implemented

### Mobile-first Svelte client

- **Splash screen** that preloads fonts, Leaflet tiles, and Supabase before revealing the app shell.
- **Heatmap explorer** combining OpenStreetMap tiles and configurable filters (date range, crime categories, resolution).
- **Route planner** with three routing modes (fastest, balanced, safety-aware) that colours each step by risk and surfaces a segment-by-segment breakdown.
- **POI discovery view** that overlays nearby shops, restaurants, clubs, and police support contacts with crowdsourced safety sentiment voting.
- **Current location details** that guesses the most relevant POI for the user and allows quick safety feedback submission.
- **Supabase telemetry** hooks for location heartbeats, search queries, routing requests, and POI sentiment votes.

### Express backend

- Serves pre-processed heatmap tiles filtered by bounds, month range, and categories.
- Provides a path-building helper that trades off distance against the weighted crime index to produce safer waypoints.
- Exposes POI metadata, search proxy, and telemetry ingestion endpoints.
- Includes scripts for Supabase bootstrap and CSV-to-heatmap preprocessing.

## Testing

- Frontend: `npm run check` (configure optionally with `svelte-check`) and `npm run test` once unit tests are added.
- Backend: add integration tests with your preferred runner (e.g. `vitest` or `jest`).

> Automated tests were not executed in this offline environment. Run the commands locally after installing dependencies.

## Next steps

- Hook pathfinding to a production-ready routing service (GraphHopper, OSRM, or Valhalla) with crime-weighted cost functions.
- Replace sample JSON with Supabase-sourced data and automate nightly refresh jobs.
- Harden telemetry collection (batching, privacy-preserving geofencing) and expose dashboards for university safety teams.
- Expand POI metadata with student union verified safe spaces and late-night transport hubs.
