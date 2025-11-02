import { writable, derived } from 'svelte/store';

export const appLoaded = writable(false);
export const activeScreen = writable('map4');
export const currentLocation = writable(null);
export const selectedStart = writable(null);
export const selectedEnd = writable(null);
export const selectedPath = writable(null);
export const pathSegments = writable([]);
export const pathRiskSummary = derived(pathSegments, ($segments) => {
  const total = $segments.reduce(
    (acc, segment) => {
      return {
        distance: acc.distance + (segment.distance || 0),
        duration: acc.duration + (segment.duration || 0),
        risk: acc.risk + (segment.riskScore || 0)
      };
    },
    { distance: 0, duration: 0, risk: 0 }
  );
  return total;
});

export const heatmapFilters = writable({
  monthsBack: 6,
  categories: [],
  resolution: 'medium'
});

export const poiSafetyVotes = writable({});
