<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet.heat';
  
  let mapContainer;
  let map;
  let userMarker;
  let heatmapLayer;
  let locationPermissionStatus = 'prompt'; // 'prompt', 'granted', 'denied'
  let locationError = null;
  let userLocation = null;
  let crimeData = [];
  
  // Default location (Durham, UK) in case geolocation fails
  const defaultLocation = [54.7753, -1.5849];
  
  onMount(async () => {
    // Load crime data
    await loadCrimeData();
    
    // Initialize the map
    initializeMap();
    
    // Request user location
    await requestUserLocation();
    
    // Add heatmap after map is initialized
    if (map && crimeData.length > 0) {
      addHeatmapLayer();
    }
  });
  
  async function loadCrimeData() {
    try {
      const response = await fetch('/data/crime_data.json');
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
        .filter(item => item && item.Latitude && item.Longitude);
      
      console.log(`Loaded ${crimeData.length} crime records`);
    } catch (error) {
      console.error('Failed to load crime data:', error);
    }
  }
  
  function addHeatmapLayer() {
    if (!map || crimeData.length === 0) return;
    
    // Convert crime data to heatmap format [lat, lng, intensity]
    const heatmapData = crimeData.map(crime => {
      // Use intensity of 0.5 for all crimes, can be adjusted based on crime type
      const intensity = getCrimeIntensity(crime['Crime type']);
      return [parseFloat(crime.Latitude), parseFloat(crime.Longitude), intensity];
    });
    
    // Create and add heatmap layer
    heatmapLayer = L.heatLayer(heatmapData, {
      radius: 25,
      blur: 35,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.0: '#0000ff',
        0.2: '#00ffff',
        0.4: '#00ff00',
        0.6: '#ffff00',
        0.8: '#ff8800',
        1.0: '#ff0000'
      }
    }).addTo(map);
  }
  
  function getCrimeIntensity(crimeType) {
    // Assign different intensities based on crime severity
    const severityMap = {
      'Violence and sexual offences': 1.0,
      'Robbery': 0.9,
      'Burglary': 0.8,
      'Drugs': 0.7,
      'Possession of weapons': 0.9,
      'Public order': 0.5,
      'Vehicle crime': 0.6,
      'Shoplifting': 0.3,
      'Theft from the person': 0.7,
      'Other theft': 0.4,
      'Criminal damage and arson': 0.6,
      'Anti-social behaviour': 0.3,
      'Bicycle theft': 0.3,
      'Other crime': 0.5
    };
    
    return severityMap[crimeType] || 0.5;
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
          
          userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.7,
            radius: 8,
            weight: 2
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
    if (heatmapLayer) {
      if (showHeatmap) {
        map.addLayer(heatmapLayer);
      } else {
        map.removeLayer(heatmapLayer);
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
      <p>📊 {crimeData.length} crime incidents loaded</p>
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
</style>