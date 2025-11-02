<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  
  let mapContainer;
  let map;
  let userMarker;
  let accuracyCircle;
  let tileLayer;
  let locationPermissionStatus = 'prompt'; // 'prompt', 'granted', 'denied'
  let locationError = null;
  let userLocation = null;
  let crimeData = [];
  let maxCrimeCount = 0;
  let severityThresholds = {
    low: 80,    // 0-80 percentile
    medium: 95  // 80-95 percentile, 95-100 is high
  };
  let showQuantileControls = false;
  let categorizedData = {
    Low: 0,
    Medium: 0,
    High: 0
  };
  
  // Default location (Durham, UK) in case geolocation fails
  const defaultLocation = [54.7753, -1.5849];
  
  onMount(async () => {
    // Load crime tile data
    await loadCrimeData();
    
    // Initialize the map
    initializeMap();
    
    // Request user location
    await requestUserLocation();
    
    // Add tiles after map is initialized
    if (map && crimeData.length > 0) {
      addCrimeTiles();
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
  
  function recalculateCategories() {
    calculateQuantileCategories();
    
    // Redraw tiles with new categories
    if (map && tileLayer) {
      map.removeLayer(tileLayer);
      addCrimeTiles();
    }
  }
  
  function addCrimeTiles() {
    if (!map || crimeData.length === 0) return;
    
    // Create a layer group for all tiles
    tileLayer = L.layerGroup();
    
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
      
      // Bind popup for desktop
      rectangle.bindPopup(popupContent, {
        maxWidth: 300,
        maxHeight: 500
      });
      
      // Add click handler for mobile
      rectangle.on('click', () => {
        if (isMobileDevice()) {
          openMobileTileDetail({
            ...tile,
            fillColor,
            severity,
            sortedCrimeTypes
          });
        }
      });
      
      // Add to layer group
      rectangle.addTo(tileLayer);
    });
    
    // Add layer group to map
    tileLayer.addTo(map);
  }
  
  function initializeMap() {
    // Create map with default location
    map = L.map(mapContainer).setView(defaultLocation, 13);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);
  }
  
  async function requestUserLocation() {
    if (!navigator.geolocation) {
      locationError = 'Geolocation is not supported by this browser.';
      locationPermissionStatus = 'denied';
      return;
    }
    
    try {
      // Check current permission status if available
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        locationPermissionStatus = permission.state;
        
        // Listen for permission changes
        permission.addEventListener('change', () => {
          locationPermissionStatus = permission.state;
        });
      }
      
      // Request current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          
          locationPermissionStatus = 'granted';
          locationError = null;
          
          // Update map view to user location
          map.setView([userLocation.lat, userLocation.lng], 15);
          
          // Add or update user marker
          if (userMarker) {
            map.removeLayer(userMarker);
          }
          
          // Create custom icon using student.png
          const studentIcon = L.icon({
            iconUrl: '/student.png',
            iconSize: [75, 75], // Size of the icon
            iconAnchor: [50, 50], // Point of the icon which will correspond to marker's location
            popupAnchor: [0, -50] // Point from which the popup should open relative to the iconAnchor
          });
          
          userMarker = L.marker([userLocation.lat, userLocation.lng], {
            icon: studentIcon
          }).addTo(map);
          
          // Add accuracy circle
          accuracyCircle = L.circle([userLocation.lat, userLocation.lng], {
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.1,
            radius: userLocation.accuracy,
            weight: 1
          }).addTo(map);
          
          userMarker.bindPopup('Your current location').openPopup();
        },
        (error) => {
          locationPermissionStatus = 'denied';
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              locationError = 'Location access denied by user.';
              break;
            case error.POSITION_UNAVAILABLE:
              locationError = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              locationError = 'Location request timed out.';
              break;
            default:
              locationError = 'An unknown error occurred while retrieving location.';
              break;
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
      
    } catch (error) {
      locationError = 'Error requesting location permission: ' + error.message;
      locationPermissionStatus = 'denied';
    }
  }
  
  function retryLocation() {
    locationError = null;
    requestUserLocation();
  }
  
  let showHeatmap = true;
  let showUserLocation = true;
  let showMobileMenu = false;
  let showInfoOverlays = false;
  let showMobileTileDetail = false;
  let selectedTileData = null;
  
  function toggleMobileMenu() {
    showMobileMenu = !showMobileMenu;
  }
  
  function toggleInfoOverlays() {
    showInfoOverlays = !showInfoOverlays;
  }
  
  function openMobileTileDetail(tile) {
    selectedTileData = tile;
    showMobileTileDetail = true;
  }
  
  function closeMobileTileDetail() {
    showMobileTileDetail = false;
    selectedTileData = null;
  }
  
  function isMobileDevice() {
    return window.innerWidth <= 768;
  }
  
  function toggleHeatmap() {
    showHeatmap = !showHeatmap;
    if (tileLayer) {
      if (showHeatmap) {
        map.addLayer(tileLayer);
      } else {
        map.removeLayer(tileLayer);
      }
    }
  }
  
  function toggleUserLocation() {
    showUserLocation = !showUserLocation;
    if (userMarker && map) {
      if (showUserLocation) {
        map.addLayer(userMarker);
        if (accuracyCircle) {
          map.addLayer(accuracyCircle);
        }
      } else {
        map.removeLayer(userMarker);
        if (accuracyCircle) {
          map.removeLayer(accuracyCircle);
        }
      }
    }
  }
</script>

<div class="map-container">
  {#if locationPermissionStatus === 'prompt'}
    <div class="permission-prompt">
      <h3>Location Access Required</h3>
      <p>This app needs access to your location to show nearby safety information.</p>
      <button on:click={retryLocation} class="btn-primary">Allow Location Access</button>
    </div>
  {/if}
  
  {#if locationError}
    <div class="error-message">
      <p>{locationError}</p>
      <button on:click={retryLocation} class="btn-secondary">Try Again</button>
    </div>
  {/if}
  
  <div class="map-wrapper" bind:this={mapContainer}></div>
  
  <!-- Mobile Menu Toggle Button -->
  <button class="mobile-menu-toggle" on:click={toggleMobileMenu} title="Toggle Menu">
    {#if showMobileMenu}
      ✕
    {:else}
      ☰
    {/if}
  </button>
  
  <!-- Map Controls -->
  <div class="map-controls" class:mobile-open={showMobileMenu}>
    <button 
      class="control-button" 
      class:active={showHeatmap}
      on:click={toggleHeatmap}
      title="Toggle Crime Heatmap"
    >
      {#if showHeatmap}
        🔥 Hide Heatmap
      {:else}
        🗺️ Show Heatmap
      {/if}
    </button>
    
    <button 
      class="control-button settings-button" 
      class:active={showQuantileControls}
      on:click={() => showQuantileControls = !showQuantileControls}
      title="Adjust Quantile Ranges"
    >
      ⚙️ Settings
    </button>
    
    <button 
      class="control-button location-button" 
      class:active={showUserLocation}
      on:click={toggleUserLocation}
      title="Toggle User Location"
      disabled={!userLocation}
    >
      {#if showUserLocation}
        📍 Hide Location
      {:else}
        📍 Show Location
      {/if}
    </button>
    
    <button 
      class="control-button info-button" 
      class:active={showInfoOverlays}
      on:click={toggleInfoOverlays}
      title="Toggle Info Overlays"
    >
      {#if showInfoOverlays}
        ℹ️ Hide Info
      {:else}
        ℹ️ Show Info
      {/if}
    </button>
  </div>
  
  <!-- Mobile Menu Backdrop -->
  {#if showMobileMenu}
    <div class="mobile-backdrop" on:click={toggleMobileMenu}></div>
  {/if}
  
  <!-- Quantile Controls Panel -->
  {#if showQuantileControls}
    <div class="quantile-panel">
      <h3 style="margin: 0 0 15px 0; color: #333; font-size: 1.1em;">Severity Quantile Ranges</h3>
      
      <div class="quantile-control">
        <label for="low-threshold">
          <span style="color: #2e7d32;">✓ Low</span> (0 - {severityThresholds.low}%)
        </label>
        <input 
          type="range" 
          id="low-threshold"
          min="0" 
          max="100" 
          bind:value={severityThresholds.low}
          on:change={recalculateCategories}
        />
        <span class="threshold-value">{severityThresholds.low}%</span>
      </div>
      
      <div class="quantile-control">
        <label for="medium-threshold">
          <span style="color: #ef6c00;">⚡ Medium</span> ({severityThresholds.low} - {severityThresholds.medium}%)
        </label>
        <input 
          type="range" 
          id="medium-threshold"
          min="0" 
          max="100" 
          bind:value={severityThresholds.medium}
          on:change={recalculateCategories}
        />
        <span class="threshold-value">{severityThresholds.medium}%</span>
      </div>
      
      <div class="quantile-info">
        <span style="color: #c62828;">⚠️ High</span>: {severityThresholds.medium}% - 100%
      </div>
      
      <div class="quantile-stats">
        <p><strong>Current Distribution:</strong></p>
        <p style="color: #2e7d32;">Low: {categorizedData.Low} tiles</p>
        <p style="color: #ef6c00;">Medium: {categorizedData.Medium} tiles</p>
        <p style="color: #c62828;">High: {categorizedData.High} tiles</p>
      </div>
      
      <button 
        class="reset-button"
        on:click={() => {
          severityThresholds.low = 80;
          severityThresholds.medium = 95;
          recalculateCategories();
        }}
      >
        Reset to Default (80/95)
      </button>
    </div>
  {/if}
  
  {#if userLocation && showUserLocation && showInfoOverlays}
    <div class="location-info">
      <p>📍 Located at: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
      <p>Accuracy: ±{Math.round(userLocation.accuracy)}m</p>
    </div>
  {/if}
  
  {#if crimeData.length > 0 && showInfoOverlays}
    <div class="crime-stats">
      <p>📊 {crimeData.length} crime tiles</p>
      <p style="color: #2e7d32;">✓ Low: {categorizedData.Low}</p>
      <p style="color: #ef6c00;">⚡ Medium: {categorizedData.Medium}</p>
      <p style="color: #c62828;">⚠️ High: {categorizedData.High}</p>
    </div>
  {/if}
  
  <!-- Mobile Tile Detail Modal -->
  {#if showMobileTileDetail && selectedTileData}
    <div class="mobile-tile-modal">
      <div class="mobile-tile-header" style="background-color: {selectedTileData.fillColor};">
        <h2>Crime Severity: {selectedTileData.severity}</h2>
        <button class="mobile-close-button" on:click={closeMobileTileDetail}>
          ✕
        </button>
      </div>
      
      <div class="mobile-tile-content">
        <div class="mobile-tile-section">
          <h3>📊 Crime Statistics</h3>
          <div class="stat-row">
            <span class="stat-label">Total Crimes:</span>
            <span class="stat-value">{selectedTileData.crime_count}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Weighted Sum:</span>
            <span class="stat-value">{selectedTileData.weighted_crime_sum}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Decayed Sum:</span>
            <span class="stat-value">{selectedTileData.weighted_crime_decayed_sum.toFixed(2)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Original Label:</span>
            <span class="stat-value">{selectedTileData.crime_severity_label || 'N/A'}</span>
          </div>
        </div>
        
        <div class="mobile-tile-section">
          <h3>🔍 Crime Breakdown</h3>
          {#each selectedTileData.sortedCrimeTypes as crimeType}
            <div class="crime-type-row">
              <span class="crime-label">{crimeType.label}</span>
              <span class="crime-count">{crimeType.count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .map-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  
  .map-wrapper {
    width: 100%;
    height: 100%;
    z-index: 1;
  }
  
  .permission-prompt {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    text-align: center;
    z-index: 1000;
    max-width: 300px;
  }
  
  .permission-prompt h3 {
    margin: 0 0 1rem 0;
    color: #333;
  }
  
  .permission-prompt p {
    margin: 0 0 1.5rem 0;
    color: #666;
    line-height: 1.4;
  }
  
  .error-message {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff6b6b;
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    text-align: center;
    z-index: 1000;
    max-width: 300px;
  }
  
  .error-message p {
    margin: 0 0 1rem 0;
  }
  
  .location-info {
    position: absolute;
    bottom: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #333;
    z-index: 1000;
    backdrop-filter: blur(10px);
  }
  
  .location-info p {
    margin: 0.25rem 0;
  }
  
  .crime-stats {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #333;
    z-index: 1000;
    backdrop-filter: blur(10px);
  }
  
  .crime-stats p {
    margin: 0;
  }
  
  .map-controls {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .control-button {
    background: white;
    color: #333;
    border: 2px solid #ddd;
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    white-space: nowrap;
  }
  
  .control-button:hover {
    background: #f8f8f8;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }
  
  .control-button.active {
    background: #ff6b6b;
    color: white;
    border-color: #ff6b6b;
  }
  
  .control-button.active:hover {
    background: #ff5252;
    border-color: #ff5252;
  }
  
  .control-button.settings-button.active {
    background: #4285f4;
    border-color: #4285f4;
  }
  
  .control-button.settings-button.active:hover {
    background: #3367d6;
    border-color: #3367d6;
  }
  
  .control-button.location-button.active {
    background: #4CAF50;
    border-color: #4CAF50;
  }
  
  .control-button.location-button.active:hover {
    background: #45a049;
    border-color: #45a049;
  }
  
  .control-button.info-button.active {
    background: #00BCD4;
    border-color: #00BCD4;
  }
  
  .control-button.info-button.active:hover {
    background: #0097A7;
    border-color: #0097A7;
  }
  
  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .control-button:disabled:hover {
    background: white;
    transform: none;
  }
  
  .quantile-panel {
    position: absolute;
    top: 20px;
    right: 240px;
    background: rgba(255, 255, 255, 0.98);
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    min-width: 300px;
    backdrop-filter: blur(10px);
  }
  
  .quantile-control {
    margin-bottom: 20px;
  }
  
  .quantile-control label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #333;
  }
  
  .quantile-control input[type="range"] {
    width: 100%;
    margin: 8px 0;
    cursor: pointer;
  }
  
  .threshold-value {
    display: inline-block;
    margin-left: 10px;
    padding: 4px 12px;
    background: #e0e0e0;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #333;
  }
  
  .quantile-info {
    margin: 15px 0;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
  }
  
  .quantile-stats {
    margin: 15px 0;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  
  .quantile-stats p {
    margin: 4px 0;
  }
  
  .reset-button {
    width: 100%;
    background: #9e9e9e;
    color: white;
    border: none;
    padding: 0.75rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: background-color 0.2s;
    margin-top: 10px;
  }
  
  .reset-button:hover {
    background: #757575;
  }
  
  .btn-primary {
    background: #4285f4;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s;
  }
  
  .btn-primary:hover {
    background: #3367d6;
  }
  
  .btn-secondary {
    background: white;
    color: #ff6b6b;
    border: 1px solid #ff6b6b;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }
  
  .btn-secondary:hover {
    background: #ff6b6b;
    color: white;
  }
  
  /* Leaflet default styles override */
  :global(.leaflet-container) {
    font-family: inherit;
  }
  
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 8px;
  }
  
  :global(.leaflet-popup-tip) {
    background: white;
  }
  
  /* Rounded corners for crime tiles */
  :global(.rounded-tile) {
    border-radius: 8px;
  }
  
  :global(path.rounded-tile) {
    rx: 8;
    ry: 8;
  }
  
  /* Mobile Menu Toggle Button */
  .mobile-menu-toggle {
    display: none;
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 1002;
    background: white;
    color: #333;
    border: 2px solid #ddd;
    padding: 0.75rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.5rem;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .mobile-menu-toggle:hover {
    background: #f8f8f8;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  
  .mobile-backdrop {
    display: none;
  }
  
  /* Mobile Tile Detail Modal */
  .mobile-tile-modal {
    display: none;
  }
  
  /* Mobile responsive styles */

  @media (min-width: 768px) {
    .mobile-menu-toggle {
      display: none;
    }
    
    /* Hide mobile modal on desktop */
    .mobile-tile-modal {
      display: none !important;
    }
  }

  @media (max-width: 768px) {
    /* Disable Leaflet popups on mobile */
    :global(.leaflet-popup) {
      display: none !important;
    }
    
    /* Mobile Tile Modal Styles */
    .mobile-tile-modal {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: white;
      z-index: 2000;
      animation: slideInUp 0.3s ease-out;
    }
    
    @keyframes slideInUp {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }
    
    .mobile-tile-header {
      padding: 1.5rem;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .mobile-tile-header h2 {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 700;
      flex: 1;
    }
    
    .mobile-close-button {
      background: rgba(255, 255, 255, 0.3);
      color: white;
      border: 2px solid white;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
      margin-left: 1rem;
    }
    
    .mobile-close-button:active {
      background: rgba(255, 255, 255, 0.5);
      transform: scale(0.95);
    }
    
    .mobile-tile-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }
    
    .mobile-tile-section {
      background: #f5f5f5;
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    
    .mobile-tile-section:last-child {
      margin-bottom: 0;
    }
    
    .mobile-tile-section h3 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: #333;
    }
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .stat-row:last-child {
      border-bottom: none;
    }
    
    .stat-label {
      font-size: 0.95rem;
      color: #666;
      font-weight: 500;
    }
    
    .stat-value {
      font-size: 1rem;
      color: #333;
      font-weight: 700;
    }
    
    .crime-type-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .crime-type-row:last-child {
      border-bottom: none;
    }
    
    .crime-label {
      font-size: 0.9rem;
      color: #555;
      flex: 1;
    }
    
    .crime-count {
      font-size: 1.1rem;
      color: #333;
      font-weight: 700;
      background: white;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      min-width: 40px;
      text-align: center;
    }

    .mobile-menu-toggle {
      display: flex;
    }
    
    .map-controls {
      position: fixed;
      top: 0;
      right: -100%;
      width: 280px;
      height: 100vh;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      padding: 80px 20px 20px;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
      transition: right 0.3s ease-in-out;
      overflow-y: auto;
      z-index: 1001;
    }
    
    .map-controls.mobile-open {
      right: 0;
    }
    
    .mobile-backdrop {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      animation: fadeIn 0.3s ease-in-out;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    
    .control-button {
      width: 100%;
      justify-content: flex-start;
      min-width: auto;
    }
    
    .location-info {
      bottom: 80px;
      left: 10px;
      font-size: 0.75rem;
      padding: 0.4rem 0.8rem;
    }
    
    .crime-stats {
      bottom: 80px;
      right: 10px;
      font-size: 0.75rem;
      padding: 0.4rem 0.8rem;
    }
    
    .quantile-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      right: auto;
      width: 90%;
      max-width: 400px;
      max-height: 80vh;
      overflow-y: auto;
    }
  }
</style>