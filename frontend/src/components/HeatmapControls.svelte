<script>
  import { heatmapFilters } from '../lib/stores';
  import Slider from '@smui/slider';
  import categories from '../data/crimeCategories';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let months = 6;
  let selectedCategories = [];
  let resolution = 'medium';

  $: heatmapFilters.set({ monthsBack: months, categories: selectedCategories, resolution });

  function toggleCategory(category) {
    if (selectedCategories.includes(category)) {
      selectedCategories = selectedCategories.filter((item) => item !== category);
    } else {
      selectedCategories = [...selectedCategories, category];
    }
    dispatch('change');
  }

  function updateResolution(event) {
    resolution = event.target.value;
    dispatch('change');
  }
</script>

<section class="panel">
  <div class="header">
    <h2>Heatmap settings</h2>
    <span class="range">Last {months} months</span>
  </div>
  <Slider min={1} max={120} step={1} bind:value={months} on:change={() => dispatch('change')} />

  <div class="resolution">
    <label>
      <input type="radio" name="resolution" value="low" on:change={updateResolution} checked={resolution === 'low'} />
      Low detail
    </label>
    <label>
      <input type="radio" name="resolution" value="medium" on:change={updateResolution} checked={resolution === 'medium'} />
      Medium
    </label>
    <label>
      <input type="radio" name="resolution" value="high" on:change={updateResolution} checked={resolution === 'high'} />
      High detail
    </label>
  </div>

  <div class="categories">
    {#each categories as category}
      <button
        type="button"
        class:selected={selectedCategories.includes(category.id)}
        on:click={() => toggleCategory(category.id)}
      >
        {category.label}
      </button>
    {/each}
  </div>
</section>

<style>
  .panel {
    padding: 1rem;
    background: rgba(15, 23, 42, 0.75);
    color: white;
    backdrop-filter: blur(12px);
    border-radius: 16px;
    margin: 0 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .range {
    font-size: 0.8rem;
    color: #cbd5f5;
  }

  .resolution {
    display: flex;
    gap: 0.75rem;
    font-size: 0.85rem;
    margin: 0.75rem 0;
  }

  .resolution label {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  button {
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(15, 23, 42, 0.5);
    border-radius: 9999px;
    padding: 0.3rem 0.8rem;
    color: inherit;
    font-size: 0.75rem;
  }

  button.selected {
    background: white;
    color: #1d4ed8;
    border-color: white;
  }
</style>
