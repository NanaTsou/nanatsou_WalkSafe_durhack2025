<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  
  let mapContainer;
  let map;
  let fromMarker = null;
  let toMarker = null;
  let routeLayer = null;
  let contextMenu = null;
  
  let fromLocation = null;
  let toLocation = null;
  let routeSteps = [];
  let isLoadingRoute = false;
  let errorMessage = '';
  let crimeData = [];
  let maxCrimeCount = 0;
  let crimeTileLayer = null;
  let showCrimeTiles = true;
  let tilesPassedThrough = [];
  let totalCrimesOnRoute = 0;
  let highlightedTile = null;
  let highlightLayer = null;
  
  const fromIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  const toIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  onMount(async () => {
    // Load crime tile data first
    await loadCrimeData();
    
    // Initialize map
    map = L.map(mapContainer, {
      center: [54.7753, -1.5849], // Durham, UK
      zoom: 13,
      zoomControl: true
    });
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // Add crime tiles after map is initialized
    if (map && crimeData.length > 0) {
      addCrimeTiles();
    }
    
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.setView([latitude, longitude], 15);
        },
        (error) => {
          console.log('Geolocation not available, using default location');
        }
      );
    }
    
    // Add right-click context menu
    map.on('contextmenu', (e) => {
      showContextMenu(e);
    });
    
    // Close context menu on regular click
    map.on('click', () => {
      hideContextMenu();
    });
  });
  
  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
  
  async function loadCrimeData() {
    try {
      const response = await fetch('/data/crime_tile_data_v2.json');
      const text = await response.text();
      
      // Parse JSON Lines format (one JSON object per line)
      crimeData = text
        .trim()
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.warn('Failed to parse line:', line);
            return null;
          }
        })
        .filter(item => item && item.crime_count);
      
      // Find max crime count for normalization
      maxCrimeCount = Math.max(...crimeData.map(tile => tile.crime_count));
      
      console.log(`Loaded ${crimeData.length} crime tiles`);
      console.log(`Max crime count: ${maxCrimeCount}`);
    } catch (error) {
      console.error('Failed to load crime tile data:', error);
    }
  }
  
  function addCrimeTiles() {
    if (!map || crimeData.length === 0) return;
    
    // Create a layer group for all tiles
    crimeTileLayer = L.layerGroup();
    
    crimeData.forEach(tile => {
      const bounds = [
        [tile.min_latitude, tile.min_longitude],
        [tile.max_latitude, tile.max_longitude]
      ];
      
      // Normalize crime count (0 to 1)
      const normalizedIntensity = tile.crime_count / maxCrimeCount;
      
      // Get opacity based on intensity (0% = transparent, 100% = 50% blue)
      const opacity = 0.2 + normalizedIntensity * 0.5; // Max 50% opacity
      
      // Create rectangle for this tile
      const rectangle = L.rectangle(bounds, {
        color: '#0066ff',
        fillColor: '#0066ff',
        fillOpacity: opacity,
        weight: 0, // No border
        opacity: 0,
        className: 'crime-tile'
      });
      
      // Add popup with crime count
      rectangle.bindPopup(`
        <strong>Crime Count: ${tile.crime_count}</strong><br>
        Area: ${(tile.max_latitude - tile.min_latitude).toFixed(5)}° × ${(tile.max_longitude - tile.min_longitude).toFixed(5)}°
      `);
      
      // Add to layer group
      rectangle.addTo(crimeTileLayer);
    });
    
    // Add layer group to map
    crimeTileLayer.addTo(map);
  }
  
  function toggleCrimeTiles() {
    showCrimeTiles = !showCrimeTiles;
    if (crimeTileLayer) {
      if (showCrimeTiles) {
        map.addLayer(crimeTileLayer);
      } else {
        map.removeLayer(crimeTileLayer);
      }
    }
  }
  
  function showContextMenu(e) {
    const { latlng, containerPoint } = e;
    
    // Create context menu if it doesn't exist
    if (!contextMenu) {
      contextMenu = document.createElement('div');
      contextMenu.className = 'context-menu';
      document.body.appendChild(contextMenu);
    }
    
    // Position context menu
    contextMenu.style.left = `${containerPoint.x}px`;
    contextMenu.style.top = `${containerPoint.y}px`;
    contextMenu.style.display = 'block';
    
    // Create menu items
    contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="from">Set as Start Point</div>
      <div class="context-menu-item" data-action="to">Set as End Point</div>
    `;
    
    // Add click handlers
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (event) => {
        const action = event.target.dataset.action;
        if (action === 'from') {
          setFromLocation(latlng);
        } else if (action === 'to') {
          setToLocation(latlng);
        }
        hideContextMenu();
      });
    });
  }
  
  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  }
  
  function setFromLocation(latlng) {
    fromLocation = { lat: latlng.lat, lng: latlng.lng };
    
    // Remove existing marker
    if (fromMarker) {
      map.removeLayer(fromMarker);
    }
    
    // Add new marker
    fromMarker = L.marker([latlng.lat, latlng.lng], { icon: fromIcon })
      .addTo(map)
      .bindPopup('Start Point')
      .openPopup();
    
    // Clear route if exists
    clearRoute();
  }
  
  function setToLocation(latlng) {
    toLocation = { lat: latlng.lat, lng: latlng.lng };
    
    // Remove existing marker
    if (toMarker) {
      map.removeLayer(toMarker);
    }
    
    // Add new marker
    toMarker = L.marker([latlng.lat, latlng.lng], { icon: toIcon })
      .addTo(map)
      .bindPopup('End Point')
      .openPopup();
    
    // Clear route if exists
    clearRoute();
  }
  
  function clearRoute() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    routeSteps = [];
    errorMessage = '';
  }
  
  async function findRoute() {
    if (!fromLocation || !toLocation) {
      errorMessage = 'Please select both start and end points by right-clicking on the map';
      return;
    }
    
    isLoadingRoute = true;
    errorMessage = '';
    clearRoute();
    
    try {
      // Step 1: Generate intermediate waypoints that avoid high-crime areas
      const waypoints = generateSafeWaypoints(fromLocation, toLocation);
      
      // Step 2: Build OSRM URL with waypoints to guide the route
      const coordinates = [
        `${fromLocation.lng},${fromLocation.lat}`,
        ...waypoints.map(wp => `${wp.lng},${wp.lat}`),
        `${toLocation.lng},${toLocation.lat}`
      ].join(';');
      
      const url = `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&steps=true&geometries=geojson`;
      
      console.log(`Routing through ${waypoints.length} safe waypoints...`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        errorMessage = 'Could not find a route between the selected points';
        return;
      }
      
      const route = data.routes[0];
      const routeCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      
      // Calculate crime score for this route
      const crimeScore = calculateRouteCrimeScore(routeCoords);
      
      console.log(`Route found: ${crimeScore.totalCrimes} crimes, ${(route.distance / 1000).toFixed(2)}km, ${Math.round(route.duration / 60)}min`);
      
      // Draw route on map
      routeLayer = L.polyline(routeCoords, {
        color: '#4caf50', // Green for crime-avoiding route
        weight: 5,
        opacity: 0.8
      }).addTo(map);
      
      // Draw waypoints for debugging
      waypoints.forEach((wp, i) => {
        L.circleMarker([wp.lat, wp.lng], {
          radius: 4,
          color: '#FFD700',
          fillColor: '#FFD700',
          fillOpacity: 0.8,
          weight: 2
        }).addTo(map).bindPopup(`Waypoint ${i + 1}<br>Avoiding high-crime area`);
      });
      
      // Fit map to show entire route
      map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
      
      // Calculate which crime tiles the route passes through
      calculateTilesPassedThrough(routeCoords);
      
    } catch (error) {
      console.error('Error finding route:', error);
      errorMessage = 'An error occurred while finding the route. Please try again.';
    } finally {
      isLoadingRoute = false;
    }
  }
  
  function generateSafeWaypoints(from, to) {
    const waypoints = [];
    const numIntermediatePoints = 5; // Number of potential waypoints to consider
    
    // Calculate direct line between start and end
    const latStep = (to.lat - from.lat) / (numIntermediatePoints + 1);
    const lngStep = (to.lng - from.lng) / (numIntermediatePoints + 1);
    
    // For each potential waypoint position along the direct route
    for (let i = 1; i <= numIntermediatePoints; i++) {
      const directLat = from.lat + latStep * i;
      const directLng = from.lng + lngStep * i;
      
      // Find the crime level at this direct point
      const directCrime = getCrimeAtPoint(directLat, directLng);
      
      // If crime is high, try to find a safer nearby point
      if (directCrime > maxCrimeCount * 0.4) { // If crime is above 40% threshold
        const saferPoint = findSaferNearbyPoint(directLat, directLng, 0.003); // ~300m radius
        
        if (saferPoint && saferPoint.crime < directCrime * 0.7) { // At least 30% safer
          waypoints.push({ lat: saferPoint.lat, lng: saferPoint.lng });
          console.log(`Waypoint ${i}: Detouring from ${directCrime} to ${saferPoint.crime} crimes`);
        }
      }
    }
    
    return waypoints;
  }
  
  function getCrimeAtPoint(lat, lng) {
    // Find the crime tile containing this point
    for (const tile of crimeData) {
      if (lat >= tile.min_latitude && lat <= tile.max_latitude &&
          lng >= tile.min_longitude && lng <= tile.max_longitude) {
        return tile.crime_count;
      }
    }
    return 0; // No crime data for this area
  }
  
  function findSaferNearbyPoint(centerLat, centerLng, radius) {
    // Sample points in a circle around the center
    const samples = 12; // 12 points around the circle
    let bestPoint = null;
    let lowestCrime = Infinity;
    
    for (let i = 0; i < samples; i++) {
      const angle = (2 * Math.PI * i) / samples;
      const testLat = centerLat + radius * Math.cos(angle);
      const testLng = centerLng + radius * Math.sin(angle);
      
      const crime = getCrimeAtPoint(testLat, testLng);
      
      if (crime < lowestCrime) {
        lowestCrime = crime;
        bestPoint = { lat: testLat, lng: testLng, crime: crime };
      }
    }
    
    return bestPoint;
  }
  
  function calculateRouteCrimeScore(routeCoordinates) {
    let totalCrimes = 0;
    const passedTileIds = new Set();
    
    // Check each point in the route
    routeCoordinates.forEach(coord => {
      const lat = coord[0];
      const lng = coord[1];
      
      // Find which tiles contain this point
      crimeData.forEach((tile) => {
        const tileId = `${tile.min_latitude}-${tile.min_longitude}`;
        
        // Check if point is within tile bounds
        if (lat >= tile.min_latitude && lat <= tile.max_latitude &&
            lng >= tile.min_longitude && lng <= tile.max_longitude) {
          
          // Only count each tile once
          if (!passedTileIds.has(tileId)) {
            passedTileIds.add(tileId);
            totalCrimes += tile.crime_count;
          }
        }
      });
    });
    
    return {
      totalCrimes: totalCrimes,
      tilesCount: passedTileIds.size
    };
  }
  
  function formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    } else {
      return `${(meters / 1000).toFixed(2)} km`;
    }
  }
  
  function formatDuration(seconds) {
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
  
  function calculateTilesPassedThrough(routeCoordinates) {
    tilesPassedThrough = [];
    totalCrimesOnRoute = 0;
    const passedTileIds = new Set();
    
    // Check each point in the route
    routeCoordinates.forEach(coord => {
      const lat = coord[0];
      const lng = coord[1];
      
      // Find which tiles contain this point
      crimeData.forEach((tile, index) => {
        const tileId = `${tile.min_latitude}-${tile.min_longitude}`;
        
        // Check if point is within tile bounds
        if (lat >= tile.min_latitude && lat <= tile.max_latitude &&
            lng >= tile.min_longitude && lng <= tile.max_longitude) {
          
          // Only add each tile once
          if (!passedTileIds.has(tileId)) {
            passedTileIds.add(tileId);
            
            tilesPassedThrough.push({
              id: tileId,
              crimeCount: tile.crime_count,
              bounds: {
                minLat: tile.min_latitude,
                maxLat: tile.max_latitude,
                minLng: tile.min_longitude,
                maxLng: tile.max_longitude
              },
              centerLat: (tile.min_latitude + tile.max_latitude) / 2,
              centerLng: (tile.min_longitude + tile.max_longitude) / 2
            });
            
            totalCrimesOnRoute += tile.crime_count;
          }
        }
      });
    });
    
    // Sort tiles by crime count (highest first)
    tilesPassedThrough.sort((a, b) => b.crimeCount - a.crimeCount);
    
    console.log(`Route passes through ${tilesPassedThrough.length} crime tiles`);
    console.log(`Total crimes on route: ${totalCrimesOnRoute}`);
  }
</script>

<div class="path-view">
  <div class="map-section">
    <div bind:this={mapContainer} class="map-container"></div>
    
    <div class="controls">
      <button 
        class="find-route-btn" 
        on:click={findRoute}
        disabled={!fromLocation || !toLocation || isLoadingRoute}
      >
        {#if isLoadingRoute}
          Finding Safest Route...
        {:else}
          🛡️ Find Safest Path
        {/if}
      </button>
      
      <button 
        class="toggle-crime-btn" 
        class:active={showCrimeTiles}
        on:click={toggleCrimeTiles}
        title="Toggle Crime Heatmap"
      >
        {#if showCrimeTiles}
          🔥 Hide Crime Data
        {:else}
          🗺️ Show Crime Data
        {/if}
      </button>
      
      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
      
      <div class="instructions">
        Right-click on the map to set start and end points
      </div>
    </div>
  </div>
  
  {#if tilesPassedThrough.length > 0}
    <div class="crime-panel">
      <div class="crime-header">
        <h3>🚨 Crime Analysis</h3>
        <div class="total-info">
          <div class="total-stat">
            <span class="stat-label">Total Crimes on Route:</span>
            <span class="stat-value">{totalCrimesOnRoute}</span>
          </div>
          <div class="total-stat">
            <span class="stat-label">Tiles Passed Through:</span>
            <span class="stat-value">{tilesPassedThrough.length}</span>
          </div>
          <div class="total-stat">
            <span class="stat-label">Average per Tile:</span>
            <span class="stat-value">{(totalCrimesOnRoute / tilesPassedThrough.length).toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div class="tiles-list">
        {#each tilesPassedThrough as tile, index}
          <div class="tile-item" class:high-crime={tile.crimeCount > maxCrimeCount * 0.5}>
            <div class="tile-rank">#{index + 1}</div>
            <div class="tile-content">
              <div class="tile-info">
                <div class="crime-count">
                  <span class="crime-icon">🔴</span>
                  <span class="crime-number">{tile.crimeCount}</span>
                  <span class="crime-label">crimes</span>
                </div>
                <div class="danger-level">
                  {#if tile.crimeCount > maxCrimeCount * 0.7}
                    <span class="level-badge high">⚠️ High Risk</span>
                  {:else if tile.crimeCount > maxCrimeCount * 0.4}
                    <span class="level-badge medium">⚡ Medium Risk</span>
                  {:else}
                    <span class="level-badge low">✓ Low Risk</span>
                  {/if}
                </div>
              </div>
              <div class="tile-location">
                <div class="location-row">
                  <span class="location-icon">📍</span>
                  <span class="location-text">
                    Lat: {tile.centerLat.toFixed(5)}, Lng: {tile.centerLng.toFixed(5)}
                  </span>
                </div>
                <div class="location-row">
                  <span class="location-icon">📐</span>
                  <span class="location-text">
                    Area: {((tile.bounds.maxLat - tile.bounds.minLat) * (tile.bounds.maxLng - tile.bounds.minLng) * 111 * 111).toFixed(0)} km²
                  </span>
                </div>
              </div>
              <div class="tile-percentage">
                <div class="percentage-bar">
                  <div 
                    class="percentage-fill" 
                    style="width: {(tile.crimeCount / maxCrimeCount * 100)}%"
                  ></div>
                </div>
                <span class="percentage-text">{(tile.crimeCount / maxCrimeCount * 100).toFixed(1)}% of max</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .path-view {
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  
  .map-section {
    flex: 1;
    position: relative;
    min-width: 0;
  }
  
  .map-container {
    width: 100%;
    height: 100%;
  }
  
  .controls {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  
  .find-route-btn {
    padding: 12px 24px;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      background: #3367d6;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    
    &:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  }
  
  .toggle-crime-btn {
    padding: 10px 20px;
    background: white;
    color: #333;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s;
    
    &:hover {
      background: #f8f8f8;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transform: translateY(-1px);
    }
    
    &.active {
      background: #ff6b6b;
      color: white;
      border-color: #ff6b6b;
      
      &:hover {
        background: #ff5252;
        border-color: #ff5252;
      }
    }
  }
  
  .instructions {
    background: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    color: #666;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .error-message {
    background: #f44336;
    color: white;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 14px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    max-width: 300px;
    text-align: center;
  }
  
  .crime-panel {
    width: 450px;
    background: white;
    border-left: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .crime-header {
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    
    h3 {
      margin: 0 0 15px 0;
      font-size: 20px;
      font-weight: 700;
    }
    
    .total-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .total-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      backdrop-filter: blur(10px);
      
      .stat-label {
        font-size: 13px;
        opacity: 0.9;
      }
      
      .stat-value {
        font-size: 18px;
        font-weight: 700;
      }
    }
  }
  
  .tiles-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
  
  .tile-item {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: 10px;
    margin-bottom: 12px;
    background: #f8f9fa;
    transition: all 0.2s;
    border-left: 4px solid #4285f4;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    
    &:hover {
      background: #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      transform: translateX(4px);
    }
    
    &.high-crime {
      border-left-color: #f44336;
      background: #ffebee;
      
      &:hover {
        background: #fff5f5;
      }
    }
  }
  
  .tile-rank {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }
  
  .tile-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .tile-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .crime-count {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .crime-icon {
      font-size: 18px;
    }
    
    .crime-number {
      font-size: 24px;
      font-weight: 700;
      color: #333;
    }
    
    .crime-label {
      font-size: 13px;
      color: #666;
    }
  }
  
  .danger-level {
    .level-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      
      &.high {
        background: #ffebee;
        color: #c62828;
      }
      
      &.medium {
        background: #fff3e0;
        color: #ef6c00;
      }
      
      &.low {
        background: #e8f5e9;
        color: #2e7d32;
      }
    }
  }
  
  .tile-location {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .location-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #666;
    
    .location-icon {
      font-size: 13px;
    }
    
    .location-text {
      font-family: monospace;
    }
  }
  
  .tile-percentage {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    .percentage-bar {
      width: 100%;
      height: 6px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      
      .percentage-fill {
        height: 100%;
        background: linear-gradient(90deg, #4285f4 0%, #667eea 100%);
        transition: width 0.3s ease;
      }
    }
    
    .percentage-text {
      font-size: 11px;
      color: #999;
      text-align: right;
    }
  }
  
  :global(.context-menu) {
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    min-width: 180px;
    padding: 4px 0;
    display: none;
  }
  
  :global(.context-menu-item) {
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
    
    &:hover {
      background: #f0f0f0;
    }
  }
  
  @media (max-width: 768px) {
    .path-view {
      flex-direction: column;
    }
    
    .crime-panel {
      width: 100%;
      height: 50%;
      border-left: none;
      border-top: 1px solid #e0e0e0;
    }
    
    .controls {
      top: 80px;
    }
  }
</style>