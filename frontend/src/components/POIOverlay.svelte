<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  
  let mapContainer;
  let map;
  let userMarker;
  let tileLayer;
  let poiLayer;
  let locationPermissionStatus = 'prompt';
  let locationError = null;
  let userLocation = null;
  let crimeData = [];
  let maxCrimeCount = 0;
  let pois = [];
  let showHeatmap = true;
  let showPOIs = true;
  let isLoadingPOIs = false;
  
  const defaultLocation = [54.7753, -1.5849]; // Durham, UK
  
  onMount(async () => {
    await loadCrimeData();
    initializeMap();
    await requestUserLocation();
    
    if (map && crimeData.length > 0) {
      addCrimeTiles();
    }
  });
  
  async function loadCrimeData() {
    try {
      const response = await fetch('/data/crime_tile_data_v1.json');
      const text = await response.text();
      
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
      
      maxCrimeCount = Math.max(...crimeData.map(tile => tile.crime_count));
      
      console.log(`Loaded ${crimeData.length} crime tiles`);
      console.log(`Max crime count: ${maxCrimeCount}`);
    } catch (error) {
      console.error('Failed to load crime tile data:', error);
    }
  }
  
  function addCrimeTiles() {
    if (!map || crimeData.length === 0) return;
    
    tileLayer = L.layerGroup();
    
    crimeData.forEach(tile => {
      const bounds = [
        [tile.min_latitude, tile.min_longitude],
        [tile.max_latitude, tile.max_longitude]
      ];
      
      const normalizedIntensity = tile.crime_count / maxCrimeCount;
      const opacity = 0.2 + normalizedIntensity * 0.5;
      
      const rectangle = L.rectangle(bounds, {
        color: '#0066ff',
        fillColor: '#0066ff',
        fillOpacity: opacity,
        weight: 0,
        opacity: 0,
        className: 'rounded-tile'
      });
      
      rectangle.bindPopup(`
        <strong>Crime Count: ${tile.crime_count}</strong><br>
        Area: ${(tile.max_latitude - tile.min_latitude).toFixed(5)}° × ${(tile.max_longitude - tile.min_longitude).toFixed(5)}°
      `);
      
      rectangle.addTo(tileLayer);
    });
    
    tileLayer.addTo(map);
  }
  
  function initializeMap() {
    map = L.map(mapContainer).setView(defaultLocation, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);
    
    // Listen to map move events to load POIs
    map.on('moveend', loadPOIs);
  }
  
  async function requestUserLocation() {
    if (!navigator.geolocation) {
      locationError = 'Geolocation is not supported by this browser.';
      locationPermissionStatus = 'denied';
      return;
    }
    
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        locationPermissionStatus = permission.state;
        
        permission.addEventListener('change', () => {
          locationPermissionStatus = permission.state;
        });
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          
          locationPermissionStatus = 'granted';
          locationError = null;
          
          map.setView([userLocation.lat, userLocation.lng], 15);
          
          if (userMarker) {
            map.removeLayer(userMarker);
          }
          
          const studentIcon = L.icon({
            iconUrl: '/student.png',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
          });
          
          userMarker = L.marker([userLocation.lat, userLocation.lng], {
            icon: studentIcon
          }).addTo(map);
          
          L.circle([userLocation.lat, userLocation.lng], {
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.1,
            radius: userLocation.accuracy,
            weight: 1
          }).addTo(map);
          
          userMarker.bindPopup('Your current location').openPopup();
          
          // Load POIs for current location
          loadPOIs();
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

  async function loadPOIs() {
    if (!map || isLoadingPOIs) return;
    
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    
    isLoadingPOIs = true;
    
    try {
      // Overpass API query for bars and restaurants
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="bar"](${south},${west},${north},${east});
          node["amenity"="pub"](${south},${west},${north},${east});
          node["amenity"="restaurant"](${south},${west},${north},${east});
          way["amenity"="bar"](${south},${west},${north},${east});
          way["amenity"="pub"](${south},${west},${north},${east});
          way["amenity"="restaurant"](${south},${west},${north},${east});
        );
        out center;
      `;
      
      const response = await fetch('/data/poi.json');
      
      const data = await response.json();
      
      // Clear existing POI markers
      if (poiLayer) {
        map.removeLayer(poiLayer);
      }
      
      poiLayer = L.layerGroup();
      pois = [];
      
      // Process POIs
      data.elements.forEach(element => {
        let lat, lng;
        
        if (element.type === 'node') {
          lat = element.lat;
          lng = element.lon;
        } else if (element.center) {
          lat = element.center.lat;
          lng = element.center.lon;
        } else {
          return;
        }
        
        const name = element.tags.name || 'Unnamed';
        const amenity = element.tags.amenity;
        
        // Calculate crime count at this POI location
        const crimeCount = getCrimeAtLocation(lat, lng);
        
        pois.push({
          id: element.id,
          name: name,
          type: amenity,
          lat: lat,
          lng: lng,
          crimeCount: crimeCount
        });
        
        // Create icon based on type
        let iconEmoji, iconBg;
        if (amenity === 'bar' || amenity === 'pub') {
          iconEmoji = '🍺';
          iconBg = '#FFF3E0';
        } else if (amenity === 'restaurant') {
          iconEmoji = '🍴';
          iconBg = '#E8F5E9';
        }
        
        // Determine border color based on crime count
        let borderColor, shadowColor;
        if (crimeCount > maxCrimeCount * 0.7) {
          borderColor = '#c62828'; // Red for high crime
          shadowColor = 'rgba(198, 40, 40, 0.5)';
        } else if (crimeCount > maxCrimeCount * 0.4) {
          borderColor = '#ef6c00'; // Orange for medium crime
          shadowColor = 'rgba(239, 108, 0, 0.5)';
        } else {
          borderColor = '#2e7d32'; // Green for low crime
          shadowColor = 'rgba(46, 125, 50, 0.5)';
        }
        
        const customIcon = L.divIcon({
          html: `
            <div style="
              font-size: 28px;
              background: ${iconBg};
              border: 4px solid ${borderColor};
              border-radius: 50%;
              width: 48px;
              height: 48px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px ${shadowColor};
              cursor: pointer;
              transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
              ${iconEmoji}
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -24],
          className: 'poi-icon'
        });
        
        const marker = L.marker([lat, lng], { icon: customIcon });
        
        // Determine danger level based on crime count
        let dangerLevel = '';
        let dangerColor = '';
        if (crimeCount > maxCrimeCount * 0.7) {
          dangerLevel = '⚠️ High Risk';
          dangerColor = 'color: #c62828;';
        } else if (crimeCount > maxCrimeCount * 0.4) {
          dangerLevel = '⚡ Medium Risk';
          dangerColor = 'color: #ef6c00;';
        } else {
          dangerLevel = '✓ Low Risk';
          dangerColor = 'color: #2e7d32;';
        }
        
        marker.bindPopup(`
          <strong>${name}</strong><br>
          Type: ${amenity}<br>
          <div style="margin-top: 8px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
            <strong>Crime Data:</strong><br>
            🔴 <strong>${crimeCount}</strong> crimes in this area<br>
            <span style="${dangerColor} font-weight: bold;">${dangerLevel}</span>
          </div>
          <a href="https://www.openstreetmap.org/${element.type}/${element.id}" target="_blank" style="display: inline-block; margin-top: 8px;">View on OSM</a>
        `);
        
        marker.addTo(poiLayer);
      });
      
      if (showPOIs) {
        poiLayer.addTo(map);
      }
      
      console.log(`Loaded ${pois.length} POIs (bars and restaurants)`);
      
    } catch (error) {
      console.error('Failed to load POIs:', error);
    } finally {
      isLoadingPOIs = false;
    }
  }
  
  async function loadPOIsAPI() {
    if (!map || isLoadingPOIs) return;
    
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    
    isLoadingPOIs = true;
    
    try {
      // Overpass API query for bars and restaurants
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="bar"](${south},${west},${north},${east});
          node["amenity"="pub"](${south},${west},${north},${east});
          node["amenity"="restaurant"](${south},${west},${north},${east});
          way["amenity"="bar"](${south},${west},${north},${east});
          way["amenity"="pub"](${south},${west},${north},${east});
          way["amenity"="restaurant"](${south},${west},${north},${east});
        );
        out center;
      `;
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });
      
      const data = await response.json();
      
      // Clear existing POI markers
      if (poiLayer) {
        map.removeLayer(poiLayer);
      }
      
      poiLayer = L.layerGroup();
      pois = [];
      
      // Process POIs
      data.elements.forEach(element => {
        let lat, lng;
        
        if (element.type === 'node') {
          lat = element.lat;
          lng = element.lon;
        } else if (element.center) {
          lat = element.center.lat;
          lng = element.center.lon;
        } else {
          return;
        }
        
        const name = element.tags.name || 'Unnamed';
        const amenity = element.tags.amenity;
        
        // Calculate crime count at this POI location
        const crimeCount = getCrimeAtLocation(lat, lng);
        
        pois.push({
          id: element.id,
          name: name,
          type: amenity,
          lat: lat,
          lng: lng,
          crimeCount: crimeCount
        });
        
        // Create icon based on type
        let iconEmoji, iconBg;
        if (amenity === 'bar' || amenity === 'pub') {
          iconEmoji = '🍺';
          iconBg = '#FFF3E0';
        } else if (amenity === 'restaurant') {
          iconEmoji = '🍴';
          iconBg = '#E8F5E9';
        }
        
        // Determine border color based on crime count
        let borderColor, shadowColor;
        if (crimeCount > maxCrimeCount * 0.7) {
          borderColor = '#c62828'; // Red for high crime
          shadowColor = 'rgba(198, 40, 40, 0.5)';
        } else if (crimeCount > maxCrimeCount * 0.4) {
          borderColor = '#ef6c00'; // Orange for medium crime
          shadowColor = 'rgba(239, 108, 0, 0.5)';
        } else {
          borderColor = '#2e7d32'; // Green for low crime
          shadowColor = 'rgba(46, 125, 50, 0.5)';
        }
        
        const customIcon = L.divIcon({
          html: `
            <div style="
              font-size: 28px;
              background: ${iconBg};
              border: 4px solid ${borderColor};
              border-radius: 50%;
              width: 48px;
              height: 48px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px ${shadowColor};
              cursor: pointer;
              transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
              ${iconEmoji}
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -24],
          className: 'poi-icon'
        });
        
        const marker = L.marker([lat, lng], { icon: customIcon });
        
        // Determine danger level based on crime count
        let dangerLevel = '';
        let dangerColor = '';
        if (crimeCount > maxCrimeCount * 0.7) {
          dangerLevel = '⚠️ High Risk';
          dangerColor = 'color: #c62828;';
        } else if (crimeCount > maxCrimeCount * 0.4) {
          dangerLevel = '⚡ Medium Risk';
          dangerColor = 'color: #ef6c00;';
        } else {
          dangerLevel = '✓ Low Risk';
          dangerColor = 'color: #2e7d32;';
        }
        
        marker.bindPopup(`
          <strong>${name}</strong><br>
          Type: ${amenity}<br>
          <div style="margin-top: 8px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
            <strong>Crime Data:</strong><br>
            🔴 <strong>${crimeCount}</strong> crimes in this area<br>
            <span style="${dangerColor} font-weight: bold;">${dangerLevel}</span>
          </div>
          <a href="https://www.openstreetmap.org/${element.type}/${element.id}" target="_blank" style="display: inline-block; margin-top: 8px;">View on OSM</a>
        `);
        
        marker.addTo(poiLayer);
      });
      
      if (showPOIs) {
        poiLayer.addTo(map);
      }
      
      console.log(`Loaded ${pois.length} POIs (bars and restaurants)`);
      
    } catch (error) {
      console.error('Failed to load POIs:', error);
    } finally {
      isLoadingPOIs = false;
    }
  }
  
  function retryLocation() {
    locationError = null;
    requestUserLocation();
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
  
  function togglePOIs() {
    showPOIs = !showPOIs;
    if (poiLayer) {
      if (showPOIs) {
        poiLayer.addTo(map);
      } else {
        map.removeLayer(poiLayer);
      }
    }
  }
  
  function getCrimeAtLocation(lat, lng) {
    // Find the crime tile containing this location
    for (const tile of crimeData) {
      if (lat >= tile.min_latitude && lat <= tile.max_latitude &&
          lng >= tile.min_longitude && lng <= tile.max_longitude) {
        return tile.crime_count;
      }
    }
    return 0; // No crime data for this location
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
    
    <button 
      class="control-button poi-button" 
      class:active={showPOIs}
      on:click={togglePOIs}
      title="Toggle Points of Interest"
    >
      {#if showPOIs}
        📍 Hide POIs
      {:else}
        📍 Show POIs
      {/if}
    </button>
    
    {#if isLoadingPOIs}
      <div class="loading-indicator">
        Loading POIs...
      </div>
    {/if}
  </div>
  
  {#if userLocation}
    <div class="location-info">
      <p>📍 Located at: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
      <p>Accuracy: ±{Math.round(userLocation.accuracy)}m</p>
    </div>
  {/if}
  
  {#if pois.length > 0}
    <div class="poi-stats">
      <p>🍺 Bars/Pubs: {pois.filter(p => p.type === 'bar' || p.type === 'pub').length}</p>
      <p>🍴 Restaurants: {pois.filter(p => p.type === 'restaurant').length}</p>
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
  
  .poi-stats {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #333;
    z-index: 1000;
    backdrop-filter: blur(10px);
  }
  
  .poi-stats p {
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
  
  .control-button.poi-button.active {
    background: #4CAF50;
    border-color: #4CAF50;
  }
  
  .control-button.poi-button.active:hover {
    background: #45a049;
    border-color: #45a049;
  }
  
  .loading-indicator {
    background: rgba(66, 133, 244, 0.95);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
    text-align: center;
    backdrop-filter: blur(10px);
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
  
  :global(.leaflet-container) {
    font-family: inherit;
  }
  
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 8px;
  }
  
  :global(.leaflet-popup-tip) {
    background: white;
  }
  
  :global(.rounded-tile) {
    border-radius: 8px;
  }
  
  :global(path.rounded-tile) {
    rx: 8;
    ry: 8;
  }
  
  :global(.poi-icon) {
    background: transparent;
    border: none;
  }
</style>