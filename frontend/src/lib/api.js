import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export async function fetchHeatmap(bounds, filters) {
  const params = new URLSearchParams({
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
    monthsBack: filters.monthsBack,
    categories: filters.categories.join(','),
    resolution: filters.resolution
  });

  const response = await fetch(`${API_BASE_URL}/heatmap?${params.toString()}`);
  if (!response.ok) throw new Error('Unable to load heatmap data');
  return response.json();
}

export async function searchLocation(query) {
  const response = await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Search failed');
  return response.json();
}

export async function fetchPath(options) {
  const response = await fetch(`${API_BASE_URL}/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  if (!response.ok) throw new Error('Pathfinding failed');
  return response.json();
}

export async function fetchPOIs(bounds) {
  const params = new URLSearchParams({
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest()
  });
  const response = await fetch(`${API_BASE_URL}/poi?${params.toString()}`);
  if (!response.ok) throw new Error('Unable to load POIs');
  return response.json();
}

export async function submitSafetyVote(poiId, score) {
  await supabase.from('poi_feedback').insert({
    poi_id: poiId,
    score,
    recorded_at: new Date().toISOString()
  });
}


export async function logHeartbeat(location) {
  await supabase.from('telemetry_location').insert({
    latitude: location.lat,
    longitude: location.lng,
    captured_at: new Date().toISOString()
  });
}
