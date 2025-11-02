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
      const response = await fetch('/data/crime_tile_data2.json');
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
      // Use OSRM (Open Source Routing Machine) for routing
      const url = `https://router.project-osrm.org/route/v1/foot/${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}?overview=full&steps=true&geometries=geojson`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        errorMessage = 'Could not find a route between the selected points';
        return;
      }
      
      const route = data.routes[0];
      
      // Draw route on map
      const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      routeLayer = L.polyline(coordinates, {
        color: '#4285f4',
        weight: 5,
        opacity: 0.7
      }).addTo(map);
      
      // Fit map to show entire route
      map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
      
      // Extract step-by-step directions with detailed information
      routeSteps = [];
      let stepNumber = 1;
      let totalDistance = 0;
      let totalDuration = 0;
      
      route.legs.forEach(leg => {
        leg.steps.forEach((step, index) => {
          totalDistance += step.distance;
          totalDuration += step.duration;
          
          const maneuver = step.maneuver;
          const instruction = maneuver?.instruction || 'Continue';
          const maneuverType = maneuver?.type || 'straight';
          const modifier = maneuver?.modifier || '';
          const streetName = step.name || '';
          const ref = step.ref || '';
          
          routeSteps.push({
            number: stepNumber++,
            instruction: instruction,
            distance: step.distance,
            duration: step.duration,
            maneuverType: maneuverType,
            modifier: modifier,
            streetName: streetName,
            ref: ref,
            totalDistanceSoFar: totalDistance,
            totalDurationSoFar: totalDuration
          });
        });
      });
      
      // Add final step with totals
      routeSteps.push({
        number: stepNumber,
        instruction: 'Arrive at destination',
        distance: 0,
        duration: 0,
        maneuverType: 'arrive',
        totalDistanceSoFar: totalDistance,
        totalDurationSoFar: totalDuration
      });
      
    } catch (error) {
      console.error('Error finding route:', error);
      errorMessage = 'An error occurred while finding the route. Please try again.';
    } finally {
      isLoadingRoute = false;
    }
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
          Finding Route...
        {:else}
          Find Best Walking Path
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
  
  {#if routeSteps.length > 0}
    <div class="directions-panel">
      <div class="directions-header">
        <h3>Step-by-Step Directions</h3>
        {#if routeSteps.length > 0}
          <div class="total-info">
            <span class="total-distance">
              <strong>Total:</strong> {formatDistance(routeSteps[routeSteps.length - 1].totalDistanceSoFar)}
            </span>
            <span class="total-duration">
              {formatDuration(routeSteps[routeSteps.length - 1].totalDurationSoFar)}
            </span>
          </div>
        {/if}
      </div>
      <div class="steps-list">
        {#each routeSteps as step, index}
          <div class="step-item" class:is-final={step.maneuverType === 'arrive'}>
            <div class="step-number">{step.number}</div>
            <div class="step-content">
              <div class="step-instruction">
                {step.instruction}
                {#if step.streetName && step.streetName !== ''}
                  <span class="street-name">on {step.streetName}</span>
                {/if}
                {#if step.ref && step.ref !== ''}
                  <span class="road-ref">({step.ref})</span>
                {/if}
              </div>
              
              {#if step.distance > 0}
                <div class="step-details">
                  <div class="detail-row">
                    <span class="detail-icon">📏</span>
                    <span class="detail-text">{formatDistance(step.distance)}</span>
                    <span class="detail-separator">•</span>
                    <span class="detail-icon">⏱️</span>
                    <span class="detail-text">{formatDuration(step.duration)}</span>
                  </div>
                  {#if step.modifier && step.modifier !== ''}
                    <div class="detail-row modifier">
                      <span class="detail-icon">↪️</span>
                      <span class="detail-text">Turn {step.modifier}</span>
                    </div>
                  {/if}
                </div>
              {/if}
              
              {#if step.maneuverType === 'arrive'}
                <div class="arrival-info">
                  <div class="detail-row">
                    <span class="detail-icon">✅</span>
                    <span class="detail-text">
                      Journey complete: {formatDistance(step.totalDistanceSoFar)} 
                      in {formatDuration(step.totalDurationSoFar)}
                    </span>
                  </div>
                </div>
              {/if}
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
  
  .directions-panel {
    width: 420px;
    background: white;
    border-left: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .directions-header {
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
    background: #f9f9f9;
    
    h3 {
      margin: 0 0 10px 0;
      font-size: 18px;
      font-weight: 600;
    }
    
    .total-info {
      display: flex;
      gap: 12px;
      font-size: 14px;
      color: #666;
      
      .total-distance {
        strong {
          color: #333;
        }
      }
    }
  }
  
  .steps-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }
  
  .step-item {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-radius: 8px;
    margin-bottom: 10px;
    background: #f5f5f5;
    transition: all 0.2s;
    border-left: 3px solid transparent;
    
    &:hover {
      background: #e8e8e8;
      border-left-color: #4285f4;
    }
    
    &.is-final {
      background: #e8f5e9;
      border-left-color: #4caf50;
      
      &:hover {
        background: #c8e6c9;
      }
    }
  }
  
  .step-number {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    background: #4285f4;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
  }
  
  .step-content {
    flex: 1;
    min-width: 0;
  }
  
  .step-instruction {
    font-size: 15px;
    color: #333;
    margin-bottom: 8px;
    line-height: 1.5;
    font-weight: 500;
    
    .street-name {
      color: #4285f4;
      font-weight: 600;
    }
    
    .road-ref {
      color: #666;
      font-size: 13px;
      font-weight: 400;
      margin-left: 4px;
    }
  }
  
  .step-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  
  .detail-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;
    
    &.modifier {
      color: #ff9800;
      font-weight: 500;
    }
    
    .detail-icon {
      font-size: 14px;
    }
    
    .detail-text {
      white-space: nowrap;
    }
    
    .detail-separator {
      color: #ccc;
    }
  }
  
  .arrival-info {
    margin-top: 8px;
    padding: 8px;
    background: rgba(76, 175, 80, 0.1);
    border-radius: 4px;
    
    .detail-row {
      color: #2e7d32;
      font-weight: 500;
      
      .detail-text {
        white-space: normal;
      }
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
    
    .directions-panel {
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