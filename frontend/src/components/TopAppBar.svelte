<script>
  import { activeScreen } from '../lib/stores';

  const titles = {
    map: 'Map 1',
    map2: 'Heatmap',
    map3: 'Colored Tilemap',
    map4: 'Weighted Tilemap',
    map5: 'Simulation',
    path: 'Safer Route Planner',
    poi: 'Trusted Places Nearby',
    location: 'Where You Are Now'
  };
</script>

<header>
  <div class="title">{titles[$activeScreen]}</div>
</header>

<style>
  header {
    background: white;
    padding: 0.75rem 1rem;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
    position: relative;
    z-index: 5;
  }

  .title {
    font-size: 1.1rem;
    font-weight: 600;
  }
</style>
