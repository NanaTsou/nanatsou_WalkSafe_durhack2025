<script>
  import { fade } from 'svelte/transition';
</script>

<div class="splash" transition:fade>
  <div class="logo">SafePath UK</div>
  <p>Preparing safety insights for your route…</p>
  <div class="progress">
    <div class="bar" />
  </div>
</div>

<style>
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: linear-gradient(160deg, #1d4ed8, #0ea5e9);
    color: white;
    text-align: center;
    padding: 2rem;
  }

  .logo {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
    letter-spacing: 0.1em;
  }

  .progress {
    margin-top: 2.5rem;
    width: min(320px, 80vw);
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    overflow: hidden;
  }

  .bar {
    width: 65%;
    height: 100%;
    background: white;
    border-radius: inherit;
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    0% {
      transform: translateX(-50%);
    }
    50% {
      transform: translateX(20%);
    }
    100% {
      transform: translateX(-50%);
    }
  }
</style>
