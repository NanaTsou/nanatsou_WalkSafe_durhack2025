<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import { currentLocation, selectedStart, selectedEnd, selectedPath, pathSegments, heatmapFilters } from '../lib/stores';
  import { fetchHeatmap, fetchPath, logHeartbeat, searchLocation } from '../lib/api';
  import HeatmapControls from './HeatmapControls.svelte';
  import SearchBar from './SearchBar.svelte';
  import categories from '../data/crimeCategories';

  let map;
  let heatLayerGroup;
  let pathLayer;
  let heartbeatInterval;
  let searchResults = [];

  const algorithmOptions = [
    { id: 'fastest', label: 'Fastest (baseline)' },
    { id: 'safe-aware', label: 'Safety aware' },
    { id: 'balanced', label: 'Balanced' }
  ];
  let algorithm = 'safe-aware';

  function renderHeatmap(points = []) {
    heatLayerGroup.clearLayers();
    points.forEach((point) => {
      const intensity = point.intensity || 0.2;
      const circle = L.circleMarker([point.lat, point.lng], {
        radius: 16 * intensity + 4,
        color: `rgba(239, 68, 68, ${0.15 + intensity})`,
        fillColor: `rgba(239, 68, 68, ${0.35 + intensity / 2})`,
        fillOpacity: 0.6,
        weight: 1
      });
      circle.bindPopup(`<strong>${point.category}</strong><br/>Incidents: ${point.count}<br/>Risk index: ${point.score}`);
      heatLayerGroup.addLayer(circle);
    });
  }

  function renderPath(path) {
    if (!path) return;
    if (pathLayer) pathLayer.remove();
    pathLayer = L.geoJSON(path.geometry, {
      style: (feature) => {
        const risk = feature?.properties?.risk || 0;
        return {
          color: risk > 0.6 ? '#ef4444' : risk > 0.3 ? '#f97316' : '#22c55e',
          weight: 6,
          opacity: 0.85
        };
      }
    }).addTo(map);
    map.fitBounds(pathLayer.getBounds(), { padding: [48, 48] });
  }

  async function updateHeatmap() {
    if (!map) return;
    const bounds = map.getBounds();
    const filters = $heatmapFilters;
    const payload = await fetchHeatmap(bounds, filters);
    renderHeatmap(payload.points);
  }

  async function runPathfinding() {
    if (!$selectedStart || !$selectedEnd) return;
    const result = await fetchPath({
      start: $selectedStart,
      end: $selectedEnd,
      algorithm,
      filters: $heatmapFilters
    });
    pathSegments.set(result.segments);
    selectedPath.set(result);
    renderPath(result);
  }

  function handleMapClick(event) {
    if (!$selectedStart) {
      selectedStart.set({ lat: event.latlng.lat, lng: event.latlng.lng });
      L.marker(event.latlng, { icon: markerIcon('#1d4ed8') }).addTo(map).bindTooltip('Start');
    } else if (!$selectedEnd) {
      selectedEnd.set({ lat: event.latlng.lat, lng: event.latlng.lng });
      L.marker(event.latlng, { icon: markerIcon('#f97316') }).addTo(map).bindTooltip('Destination');
      runPathfinding();
    }
  }

  function markerIcon(color) {
    return L.divIcon({
      className: 'marker-icon',
      html: `<span style="background:${color}"></span>`
    });
  }

  async function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const latlng = [latitude, longitude];
        currentLocation.set({ lat: latitude, lng: longitude });
        map.setView(latlng, 15);
        L.marker(latlng, { icon: markerIcon('#0ea5e9') }).addTo(map).bindTooltip('You are here');
        await logHeartbeat({ lat: latitude, lng: longitude });
      },
      () => {
        map.setView([51.5072, -0.1276], 12);
      }
    );
  }

  async function handleSearch(event) {
    const { query } = event.detail;
    const payload = await searchLocation(query);
    searchResults = payload.map((item) => ({
      id: item.place_id || item.id,
      label: item.display_name || item.label,
      lat: parseFloat(item.lat || item.latitude),
      lng: parseFloat(item.lon || item.longitude)
    }));
  }

  function focusResult(result) {
    const latlng = [result.lat, result.lng];
    map.setView(latlng, 15);
    L.marker(latlng, { icon: markerIcon('#8b5cf6') }).addTo(map).bindPopup(result.label).openPopup();
    searchResults = [];
  }

  onMount(async () => {
    map = L.map('map', {
      zoomControl: false
    }).setView([51.5072, -0.1276], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    heatLayerGroup = L.layerGroup().addTo(map);

    map.on('click', handleMapClick);
    map.on('moveend', updateHeatmap);

    await locate();
    await updateHeatmap();

    heartbeatInterval = setInterval(async () => {
      if ($currentLocation) await logHeartbeat($currentLocation);
    }, 120000);
  });
  onDestroy(() => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });

  $: if (map && $selectedStart && $selectedEnd) {
    runPathfinding();
  }

  $: if (map) {
    $heatmapFilters;
    updateHeatmap();
  }

  $: if ($selectedPath) {
    renderPath($selectedPath);
  }

  const selectedCategoriesLabel = (segment) => {
    const category = categories.find((item) => item.id === segment.dominantCategory);
    return category ? category.label : 'General risk';
  };
</script>

<div class="map-view">
  <div id="map"></div>
  <div class="overlay">
    <SearchBar on:search={handleSearch} />
    {#if searchResults.length}
      <div class="search-results">
        {#each searchResults as result}
          <button on:click={() => focusResult(result)}>{result.label}</button>
        {/each}
      </div>
    {/if}
    <HeatmapControls on:change={updateHeatmap} />

    <div class="route-controls">
      <label>Routing algorithm</label>
      <select bind:value={algorithm} on:change={runPathfinding}>
        {#each algorithmOptions as option}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
    </div>

    {#if $pathSegments.length}
      <div class="path-summary">
        <h3>Segment risk breakdown</h3>
        <ul>
          {#each $pathSegments as segment, index}
            <li>
              <div>
                <strong>Step {index + 1}</strong>
                <small>{segment.instructions}</small>
              </div>
              <div class="risk">
                <span class={segment.riskScore > 0.6 ? 'high' : segment.riskScore > 0.3 ? 'medium' : 'low'}>
                  {(segment.riskScore * 100).toFixed(0)}%
                </span>
                <em>{selectedCategoriesLabel(segment)}</em>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  .map-view {
    width: 100%;
    height: 100%;
    position: relative;
  }

  #map {
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    top: 0.75rem;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    pointer-events: none;
  }

  .overlay > * {
    pointer-events: auto;
  }

  .search-results {
    background: rgba(15, 23, 42, 0.85);
    color: white;
    margin: 0 1rem;
    border-radius: 14px;
    max-height: 200px;
    overflow-y: auto;
  }

  .search-results button {
    width: 100%;
    padding: 0.6rem 1rem;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .search-results button + button {
    border-top: 1px solid rgba(148, 163, 184, 0.3);
  }

  .route-controls {
    margin: 0 1rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 23, 42, 0.85);
    color: white;
    border-radius: 14px;
  }

  .route-controls select {
    width: 100%;
    margin-top: 0.4rem;
    padding: 0.5rem;
    border-radius: 8px;
    border: none;
  }

  .path-summary {
    margin: 0 1rem 1rem;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
    padding: 1rem;
    max-height: 40vh;
    overflow-y: auto;
  }

  .path-summary ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .path-summary li {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .risk {
    text-align: right;
    display: flex;
    flex-direction: column;
  }

  .risk span {
    font-weight: 700;
    font-size: 0.9rem;
  }

  .risk span.high {
    color: #ef4444;
  }

  .risk span.medium {
    color: #f97316;
  }

  .risk span.low {
    color: #22c55e;
  }

  .risk em {
    font-size: 0.7rem;
    color: #475569;
  }

  .marker-icon span {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.8);
  }
</style>
