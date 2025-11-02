import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEATMAP_PATH = path.join(__dirname, '..', '..', 'data', 'processed', 'heatmap.json');
const POI_PATH = path.join(__dirname, '..', '..', 'data', 'processed', 'poi.json');

export function loadHeatmapData() {
  const raw = fs.readFileSync(HEATMAP_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function loadPoiData() {
  const raw = fs.readFileSync(POI_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function sampleHeatmap({ data, bounds, monthsBack, categories, resolution }) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const bucketSize = resolution === 'high' ? 0.0025 : resolution === 'low' ? 0.01 : 0.005;

  const buckets = new Map();

  data.forEach((item) => {
    if (Number.isFinite(bounds.north) && item.lat > bounds.north) return;
    if (Number.isFinite(bounds.south) && item.lat < bounds.south) return;
    if (Number.isFinite(bounds.east) && item.lng > bounds.east) return;
    if (Number.isFinite(bounds.west) && item.lng < bounds.west) return;
    if (categories.length && !categories.includes(item.category)) return;
    if (new Date(item.period) < cutoff) return;

    const keyLat = Math.round(item.lat / bucketSize) * bucketSize;
    const keyLng = Math.round(item.lng / bucketSize) * bucketSize;
    const key = `${keyLat}-${keyLng}-${item.category}`;
    if (!buckets.has(key)) {
      buckets.set(key, { lat: keyLat, lng: keyLng, category: item.category, count: 0, score: 0 });
    }
    const record = buckets.get(key);
    record.count += item.count;
    record.score = Math.max(record.score, item.score);
  });

  return Array.from(buckets.values()).map((value) => ({
    ...value,
    intensity: Math.min(1, value.score)
  }));
}

function weightedRisk(lat, lng, data) {
  let total = 0;
  let weight = 0;
  data.forEach((item) => {
    const distance = haversine(lat, lng, item.lat, item.lng);
    const w = 1 / (1 + distance);
    total += item.score * w;
    weight += w;
  });
  return weight === 0 ? 0 : total / weight;
}

export function buildPath({ start, end, algorithm, heatmap }) {
  const startPoint = [start.lat, start.lng];
  const endPoint = [end.lat, end.lng];
  const waypoints = generateWaypoints(startPoint, endPoint, algorithm, heatmap);
  const coordinates = [startPoint, ...waypoints, endPoint];

  const segments = [];
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const [fromLat, fromLng] = coordinates[i];
    const [toLat, toLng] = coordinates[i + 1];
    const risk = weightedRisk((fromLat + toLat) / 2, (fromLng + toLng) / 2, heatmap);
    const distance = haversine(fromLat, fromLng, toLat, toLng);
    segments.push({
      from: { lat: fromLat, lng: fromLng },
      to: { lat: toLat, lng: toLng },
      riskScore: risk,
      dominantCategory: dominantCategory((fromLat + toLat) / 2, (fromLng + toLng) / 2, heatmap),
      distance,
      duration: (distance / 5) * 60,
      instructions: `Walk ${(distance * 1000).toFixed(0)} meters`
    });
  }

  const features = segments.map((segment) => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [segment.from.lng, segment.from.lat],
        [segment.to.lng, segment.to.lat]
      ]
    },
    properties: {
      risk: segment.riskScore
    }
  }));

  const totalDistance = segments.reduce((acc, segment) => acc + segment.distance, 0);
  const totalDuration = segments.reduce((acc, segment) => acc + segment.duration, 0);
  const averageRisk = segments.reduce((acc, segment) => acc + segment.riskScore, 0) / (segments.length || 1);

  return {
    geometry: {
      type: 'FeatureCollection',
      features
    },
    segments,
    metrics: {
      distance: totalDistance,
      duration: totalDuration,
      safety: 1 - averageRisk
    }
  };
}

function dominantCategory(lat, lng, data) {
  let best = { category: 'general', weight: 0 };
  data.forEach((item) => {
    const distance = haversine(lat, lng, item.lat, item.lng);
    const weight = item.score / (1 + distance);
    if (weight > best.weight) {
      best = { category: item.category, weight };
    }
  });
  return best.category;
}

function generateWaypoints(start, end, algorithm, heatmap) {
  if (algorithm === 'fastest') return [];
  const midLat = (start[0] + end[0]) / 2;
  const midLng = (start[1] + end[1]) / 2;
  const risk = weightedRisk(midLat, midLng, heatmap);
  const offset = risk > 0.5 ? 0.01 : 0.005;
  const sign = algorithm === 'safe-aware' ? 1 : -1;
  const waypoint = [midLat + offset * sign, midLng - offset * sign];
  return [waypoint];
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
