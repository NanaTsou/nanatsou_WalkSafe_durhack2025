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
  let minCrimeOnRoute = 0;
  let maxCrimeOnRoute = 0;
  let severityThresholds = {
    low: 80,    // 0-80 percentile
    medium: 95  // 80-95 percentile, 95-100 is high
  };
  let categorizedData = {
    Low: 0,
    Medium: 0,
    High: 0
  };
  
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
        .filter(item => item && item.weighted_crime_decayed_sum);
      
      // Calculate quantile-based severity categories
      calculateQuantileCategories();
      
      // Find max crime count for normalization
      maxCrimeCount = Math.max(...crimeData.map(tile => tile.crime_count));
      
      console.log(`Loaded ${crimeData.length} crime tiles`);
      console.log(`Severity distribution: Low=${categorizedData.Low}, Medium=${categorizedData.Medium}, High=${categorizedData.High}`);
    } catch (error) {
      console.error('Failed to load crime tile data:', error);
    }
  }
  
  function calculateQuantileCategories() {
    if (crimeData.length === 0) return;
    
    // Sort crime data by weighted_crime_decayed_sum
    const sortedCrimes = [...crimeData].sort((a, b) => 
      a.weighted_crime_decayed_sum - b.weighted_crime_decayed_sum
    );
    
    // Calculate percentile indices
    const lowIndex = Math.floor((severityThresholds.low / 100) * sortedCrimes.length);
    const mediumIndex = Math.floor((severityThresholds.medium / 100) * sortedCrimes.length);
    
    // Get threshold values
    const lowThreshold = sortedCrimes[lowIndex]?.weighted_crime_decayed_sum || 0;
    const mediumThreshold = sortedCrimes[mediumIndex]?.weighted_crime_decayed_sum || 0;
    
    // Categorize each tile
    categorizedData = { Low: 0, Medium: 0, High: 0 };
    
    crimeData.forEach(tile => {
      if (tile.weighted_crime_decayed_sum <= lowThreshold) {
        tile.calculated_severity = 'Low';
        categorizedData.Low++;
      } else if (tile.weighted_crime_decayed_sum <= mediumThreshold) {
        tile.calculated_severity = 'Medium';
        categorizedData.Medium++;
      } else {
        tile.calculated_severity = 'High';
        categorizedData.High++;
      }
    });
    
    console.log(`Thresholds: Low ≤ ${lowThreshold.toFixed(2)}, Medium ≤ ${mediumThreshold.toFixed(2)}, High > ${mediumThreshold.toFixed(2)}`);
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
      
      // Determine color and opacity based on calculated_severity (quantile-based)
      let fillColor, fillOpacity;
      const severity = tile.calculated_severity || 'Low';
      
      if (severity === 'High') {
        fillColor = '#cc0000'; // Red for high crime
        fillOpacity = 0.6;
      } else if (severity === 'Medium') {
        fillColor = '#ffcc00'; // Orange for medium crime
        fillOpacity = 0.5;
      } else if (severity === 'Low') {
        fillColor = '#99ccff'; // Green for low crime
        fillOpacity = 0.4;
      } else {
        fillColor = '#9e9e9e'; // Grey for unknown
        fillOpacity = 0.3;
      }
      
      // Create rectangle for this tile with rounded corners
      const rectangle = L.rectangle(bounds, {
        color: fillColor,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        weight: 1,
        opacity: 0.8,
        className: 'rounded-tile'
      });
      
      // Build detailed popup with all available data
      let popupContent = `
        <div style="min-width: 300px;">
          <h3 style="margin: 0 0 10px 0; color: ${fillColor};">Crime Severity: ${severity} (Quantile-based)</h3>
          
          <div style="margin-bottom: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <strong>📊 Crime Statistics</strong><br>
            <span style="font-size: 0.9em;">
              Total Crimes: <strong>${tile.crime_count}</strong><br>
              Weighted Sum: <strong>${tile.weighted_crime_sum}</strong><br>
              Decayed Sum: <strong>${tile.weighted_crime_decayed_sum.toFixed(2)}</strong><br>
            </span>
          </div>
          
          <div style="padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <strong>🔍 Crime Breakdown</strong><br>
            <span style="font-size: 0.85em;">
      `;
      
      // Add crime type breakdown
      const crimeTypes = [
        { key: 'Anti-social behaviour', label: 'Anti-social behaviour' },
        { key: 'Bicycle theft', label: 'Bicycle theft' },
        { key: 'Burglary', label: 'Burglary' },
        { key: 'Criminal damage and arson', label: 'Criminal damage & arson' },
        { key: 'Drugs', label: 'Drugs' },
        { key: 'Other crime', label: 'Other crime' },
        { key: 'Other theft', label: 'Other theft' },
        { key: 'Possession of weapons', label: 'Weapons possession' },
        { key: 'Public order', label: 'Public order' },
        { key: 'Robbery', label: 'Robbery' },
        { key: 'Shoplifting', label: 'Shoplifting' },
        { key: 'Theft from the person', label: 'Theft from person' },
        { key: 'Vehicle crime', label: 'Vehicle crime' },
        { key: 'Violence and sexual offences', label: 'Violence & sexual offences' }
      ];
      
      // Sort crime types by count (descending) and filter out zeros
      const sortedCrimeTypes = crimeTypes
        .map(type => ({
          ...type,
          count: tile[type.key] || 0
        }))
        .filter(type => type.count > 0)
        .sort((a, b) => b.count - a.count);
      
      sortedCrimeTypes.forEach(type => {
        popupContent += `${type.label}: <strong>${type.count}</strong><br>`;
      });
      
      popupContent += `
            </span>
          </div>
        </div>
      `;
      
      // Bind popup
      rectangle.bindPopup(popupContent, {
        maxWidth: 300,
        maxHeight: 500
      });
      
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
      
      // Calculate which crime tiles the route passes through
      calculateTilesPassedThrough(coordinates);
      
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
  
  function calculateTilesPassedThrough(routeCoordinates) {
    tilesPassedThrough = [];
    totalCrimesOnRoute = 0;
    const passedTileIds = new Set();
    const tileOrderMap = new Map(); // Track order of tile encounters
    let encounterOrder = 0;
    
    // Check each point in the route IN ORDER
    routeCoordinates.forEach((coord, coordIndex) => {
      const lat = coord[0];
      const lng = coord[1];
      
      // Find which tiles contain this point
      crimeData.forEach((tile) => {
        const tileId = `${tile.min_latitude}-${tile.min_longitude}`;
        
        // Check if point is within tile bounds
        if (lat >= tile.min_latitude && lat <= tile.max_latitude &&
            lng >= tile.min_longitude && lng <= tile.max_longitude) {
          
          // Only add each tile once (when first encountered)
          if (!passedTileIds.has(tileId)) {
            passedTileIds.add(tileId);
            tileOrderMap.set(tileId, encounterOrder++);
            
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
              centerLng: (tile.min_longitude + tile.max_longitude) / 2,
              encounterOrder: encounterOrder - 1
            });
            
            totalCrimesOnRoute += tile.crime_count;
          }
        }
      });
    });
    
    // Keep tiles in the order they were encountered (route order)
    // tilesPassedThrough is already in route order, no need to sort
    
    // Calculate min and max crime counts
    if (tilesPassedThrough.length > 0) {
      const crimeCounts = tilesPassedThrough.map(t => t.crimeCount);
      minCrimeOnRoute = Math.min(...crimeCounts);
      maxCrimeOnRoute = Math.max(...crimeCounts);
    } else {
      minCrimeOnRoute = 0;
      maxCrimeOnRoute = 0;
    }
    
    console.log(`Route passes through ${tilesPassedThrough.length} crime tiles`);
    console.log(`Total crimes on route: ${totalCrimesOnRoute}`);
    console.log(`Min crime: ${minCrimeOnRoute}, Max crime: ${maxCrimeOnRoute}`);
  }
  
  function highlightTileOnMap(tile) {
    // Remove previous highlight
    if (highlightLayer) {
      map.removeLayer(highlightLayer);
    }
    
    // Create highlight rectangle
    const bounds = [
      [tile.bounds.minLat, tile.bounds.minLng],
      [tile.bounds.maxLat, tile.bounds.maxLng]
    ];
    
    highlightLayer = L.rectangle(bounds, {
      color: '#FFD700',
      weight: 4,
      fillOpacity: 0,
      dashArray: '10, 5',
      className: 'highlight-tile'
    }).addTo(map);
    
    // Pan to tile
    map.flyTo([tile.centerLat, tile.centerLng], 16, {
      duration: 0.5
    });
    
    // Update highlighted tile
    highlightedTile = tile.id;
    
    // Auto-remove highlight after 5 seconds
    setTimeout(() => {
      if (highlightLayer) {
        map.removeLayer(highlightLayer);
        highlightLayer = null;
      }
      highlightedTile = null;
    }, 5000);
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
          <div class="total-stat highlight">
            <span class="stat-label">Min Crimes:</span>
            <span class="stat-value success">{minCrimeOnRoute}</span>
          </div>
          <div class="total-stat highlight">
            <span class="stat-label">Max Crimes:</span>
            <span class="stat-value danger">{maxCrimeOnRoute}</span>
          </div>
        </div>
      </div>
      <div class="tiles-list">
        {#each tilesPassedThrough as tile, index}
          <div 
            class="tile-item" 
            class:high-crime={tile.crimeCount > maxCrimeCount * 0.5}
            class:highlighted={highlightedTile === tile.id}
            on:click={() => highlightTileOnMap(tile)}
          >
            <div class="tile-rank">#{index + 1}</div>
            <div class="tile-content">
              <div class="tile-info">
                <div class="crime-count">
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
      
      &.highlight {
        background: rgba(255, 255, 255, 0.25);
      }
      
      .stat-label {
        font-size: 13px;
        opacity: 0.9;
      }
      
      .stat-value {
        font-size: 18px;
        font-weight: 700;
        
        &.success {
          color: #a5d6a7;
        }
        
        &.danger {
          color: #ef5350;
        }
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
    cursor: pointer;
    
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
    
    &.highlighted {
      background: #fff9c4;
      border-left-color: #FFD700;
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
      transform: translateX(8px);
      
      &.high-crime {
        background: #fff9c4;
        border-left-color: #FFD700;
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
  
  :global(.highlight-tile) {
    animation: pulse 1s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }
  
  /* Rounded corners for crime tiles */
  :global(.rounded-tile) {
    border-radius: 8px;
  }
  
  :global(path.rounded-tile) {
    rx: 8;
    ry: 8;
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