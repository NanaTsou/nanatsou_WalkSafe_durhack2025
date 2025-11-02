<script>
  import { activeScreen } from '../lib/stores';

  const items = [
    { id: 'map4', label: 'Tilemap', icon: 'map' },
    { id: 'map5', label: 'Simulation', icon: 'map' },
     { id: 'path5', label: 'Safe Path 2', icon: 'directions' },
    { id: 'poi', label: 'Places', icon: 'place' },
  ];

  function switchTo(id) {
    activeScreen.set(id);
  }
</script>

<nav>
  {#each items as item}
    <button class:selected={$activeScreen === item.id} on:click={() => switchTo(item.id)}>
      <span class="material-symbols-rounded">{item.icon}</span>
      <small>{item.label}</small>
    </button>
  {/each}
</nav>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL@0..1&GRAD@-25..200&opsz@20..48');

  nav {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: white;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0; /* Prevent bottom nav from shrinking */
    position: relative;
    z-index: 1000;
  }

  button {
    border: none;
    padding: 0.6rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    background: transparent;
    color: #64748b;
  }

  button.selected {
    color: var(--primary);
    font-weight: 600;
  }

  span.material-symbols-rounded {
    font-size: 1.6rem;
  }

  small {
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }
</style>
