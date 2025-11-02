import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { createClient } from 'supabase';
import { loadHeatmapData, loadPoiData, sampleHeatmap, buildPath, haversine } from './services/dataService.js';

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, origin);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

const heatmapData = loadHeatmapData();
const poiData = loadPoiData();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/heatmap', (req, res) => {
  const { north, south, east, west, monthsBack = 6, categories = '', resolution = 'medium' } = req.query;
  const bounds = {
    north: parseFloat(north),
    south: parseFloat(south),
    east: parseFloat(east),
    west: parseFloat(west)
  };
  const result = sampleHeatmap({
    data: heatmapData,
    bounds,
    monthsBack: Number(monthsBack),
    categories: categories ? categories.split(',').filter(Boolean) : [],
    resolution
  });
  res.json({ points: result });
});

app.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'SafePath-POC/1.0' }
  });
  const payload = await response.json();

  await supabase.from('telemetry_search').insert({
    query,
    searched_at: new Date().toISOString()
  });

  res.json(payload);
});

app.post('/path', async (req, res) => {
  const { start, end, algorithm = 'safe-aware', filters = {} } = req.body || {};
  if (!start || !end) {
    return res.status(400).json({ error: 'Missing start or end coordinates' });
  }

  const path = buildPath({
    start,
    end,
    algorithm,
    heatmap: heatmapData,
    filters
  });

  await supabase.from('telemetry_paths').insert({
    start_lat: start.lat,
    start_lon: start.lng,
    end_lat: end.lat,
    end_lon: end.lng,
    algorithm,
    requested_at: new Date().toISOString()
  });

  res.json(path);
});

app.get('/poi', async (req, res) => {
  const { north, south, east, west } = req.query;
  const bounds = {
    north: parseFloat(north),
    south: parseFloat(south),
    east: parseFloat(east),
    west: parseFloat(west)
  };
  if (Object.values(bounds).some((value) => Number.isNaN(value))) {
    return res.json({ items: [] });
  }
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const filtered = poiData
    .filter((poi) => poi.lat <= bounds.north && poi.lat >= bounds.south && poi.lng <= bounds.east && poi.lng >= bounds.west)
    .map((poi) => ({
      ...poi,
      safety_level: poi.safety_level || 'medium',
      distance: haversine(centerLat, centerLng, poi.lat, poi.lng)
    }));
  res.json({ items: filtered });
});

app.post('/telemetry/location', async (req, res) => {
  const { latitude, longitude, captured_at } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  await supabase.from('telemetry_location').insert({
    latitude,
    longitude,
    captured_at: captured_at || new Date().toISOString()
  });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`SafePath backend running on port ${PORT}`);
});
