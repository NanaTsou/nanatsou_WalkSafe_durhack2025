<script>
  import { onMount } from 'svelte';
  import { currentLocation, poiSafetyVotes } from '../lib/stores';
  import { fetchPOIs, submitSafetyVote } from '../lib/api';

  let candidates = [];
  let selectedPoi = null;

  async function resolveLocation() {
    if (!$currentLocation) return;
    const bounds = {
      getNorth: () => $currentLocation.lat + 0.005,
      getSouth: () => $currentLocation.lat - 0.005,
      getEast: () => $currentLocation.lng + 0.005,
      getWest: () => $currentLocation.lng - 0.005
    };
    const payload = await fetchPOIs(bounds);
    candidates = payload.items.sort((a, b) => a.distance - b.distance).slice(0, 5);
    selectedPoi = candidates[0] || null;
  }

  async function vote(score) {
    if (!selectedPoi) return;
    await submitSafetyVote(selectedPoi.id, score);
    poiSafetyVotes.update((votes) => ({ ...votes, [selectedPoi.id]: score }));
  }

  onMount(resolveLocation);

  $: if ($currentLocation) {
    resolveLocation();
  }
</script>

<section class="location">
  {#if !$currentLocation}
    <p class="empty">Enable location to see details about where you are.</p>
  {:else if selectedPoi}
    <article>
      <header>
        <h1>{selectedPoi.name}</h1>
        <span class={`badge ${selectedPoi.safety_level}`}>
          {selectedPoi.safety_level.replace('-', ' ')}
        </span>
      </header>
      <p class="distance">About {(selectedPoi.distance * 1000).toFixed(0)} meters from you</p>
      <p>{selectedPoi.description}</p>
      <dl>
        <div>
          <dt>Category</dt>
          <dd>{selectedPoi.category}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>{selectedPoi.address}</dd>
        </div>
        <div>
          <dt>Open hours</dt>
          <dd>{selectedPoi.open_hours}</dd>
        </div>
      </dl>
      <footer>
        <p>Share how safe you feel here</p>
        <div class="actions">
          <button on:click={() => vote('positive')} class:active={$poiSafetyVotes[selectedPoi.id] === 'positive'}>👍</button>
          <button on:click={() => vote('neutral')} class:active={$poiSafetyVotes[selectedPoi.id] === 'neutral'}>😐</button>
          <button on:click={() => vote('negative')} class:active={$poiSafetyVotes[selectedPoi.id] === 'negative'}>👎</button>
        </div>
      </footer>
    </article>

    {#if candidates.length > 1}
      <aside>
        <h2>Other possible matches</h2>
        <ul>
          {#each candidates.slice(1) as poi}
            <li>
              <button on:click={() => (selectedPoi = poi)}>
                <strong>{poi.name}</strong>
                <small>{(poi.distance * 1000).toFixed(0)} m</small>
              </button>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
  {:else}
    <p class="empty">We could not match your location to a known place.</p>
  {/if}
</section>

<style>
  .location {
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  article {
    background: white;
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: 0 16px 24px rgba(15, 23, 42, 0.12);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .badge {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .badge.high {
    background: rgba(248, 113, 113, 0.15);
    color: #dc2626;
  }

  .badge.medium {
    background: rgba(251, 191, 36, 0.2);
    color: #b45309;
  }

  .badge.low {
    background: rgba(52, 211, 153, 0.2);
    color: #047857;
  }

  .distance {
    font-size: 0.85rem;
    color: #475569;
    margin-bottom: 0.75rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
  }

  dt {
    font-size: 0.75rem;
    color: #64748b;
  }

  dd {
    margin: 0.25rem 0 0;
    font-weight: 500;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .actions button {
    flex: 1;
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid #cbd5f5;
    background: white;
    font-size: 1.25rem;
  }

  .actions button.active {
    border-color: var(--primary);
    color: var(--primary);
  }

  aside ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  aside button {
    width: 100%;
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    background: white;
    display: flex;
    justify-content: space-between;
  }

  .empty {
    text-align: center;
    color: #475569;
    margin-top: 2rem;
  }
</style>
