<script>
  import { createEventDispatcher } from 'svelte';
  import Textfield from '@smui/textfield';
  const dispatch = createEventDispatcher();
  let query = '';

  async function handleSubmit(event) {
    event.preventDefault();
    if (!query.trim()) return;
    dispatch('search', { query: query.trim() });
  }
</script>

<form class="search" on:submit|preventDefault={handleSubmit}>
  <Textfield
    class="field"
    label="Search places or addresses"
    bind:value={query}
  >
    <svelte:fragment slot="trailing">
      <button type="submit">Search</button>
    </svelte:fragment>
  </Textfield>
</form>

<style>
  .search {
    padding: 0 1rem;
    margin-bottom: 0.5rem;
  }

  .field :global(.mdc-text-field) {
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
  }
  .field :global(.mdc-text-field__trailing-buttons button) {
    background: transparent;
    border: none;
    color: var(--primary);
    font-weight: 600;
    padding: 0 0.5rem;
  }
</style>
