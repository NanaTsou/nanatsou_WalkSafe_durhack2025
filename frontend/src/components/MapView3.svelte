<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  
  let mapContainer;
  let map;
  let userMarker;
  let tileLayer;
  let locationPermissionStatus = 'prompt'; // 'prompt', 'granted', 'denied'
  let locationError = null;
  let userLocation = null;
  let crimeData = [];
  let maxCrimeCount = 0;
  
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
      const response = await fetch('/data/crime_tile_data_v1.json');
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
    tileLayer = L.layerGroup();
    
    crimeData.forEach(tile => {
      const bounds = [
        [tile.min_latitude, tile.min_longitude],
        [tile.max_latitude, tile.max_longitude]
      ];
      
      // Normalize crime count (0 to 1)
      const normalizedIntensity = tile.crime_count / maxCrimeCount;
      
      // Get opacity based on intensity (0% = transparent, 100% = 50% blue)
      const opacity = 0.2 + normalizedIntensity * 0.5; // Max 50% opacity
      
      // Create rectangle for this tile with rounded corners via SVG
      const rectangle = L.rectangle(bounds, {
        color: '#0066ff',
        fillColor: '#0066ff',
        fillOpacity: opacity,
        weight: 0, // No border
        opacity: 0,
        className: 'rounded-tile' // Custom class for rounded corners
      });
      
      // Add popup with crime count
      rectangle.bindPopup(`
        <strong>Crime Count: ${tile.crime_count}</strong><br>
        Area: ${(tile.max_latitude - tile.min_latitude).toFixed(5)}° × ${(tile.max_longitude - tile.min_longitude).toFixed(5)}°
      `);
      
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
            iconSize: [100, 100], // Size of the icon
            iconAnchor: [50, 50], // Point of the icon which will correspond to marker's location
            popupAnchor: [0, -50] // Point from which the popup should open relative to the iconAnchor
          });
          
          userMarker = L.marker([userLocation.lat, userLocation.lng], {
            icon: studentIcon
          }).addTo(map);
          
          // Add accuracy circle
          L.circle([userLocation.lat, userLocation.lng], {
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
  
  <!-- Heatmap Toggle Control -->
  <div class="map-controls">
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
  </div>
  
  {#if userLocation}
    <div class="location-info">
      <p>📍 Located at: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
      <p>Accuracy: ±{Math.round(userLocation.accuracy)}m</p>
    </div>
  {/if}
  
  {#if crimeData.length > 0}
    <div class="crime-stats">
      <p>📊 {crimeData.length} crime tiles</p>
      <p>🔴 Max: {maxCrimeCount} crimes</p>
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
</style>