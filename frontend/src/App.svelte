<script>
  import { onMount } from "svelte";
  import SplashScreen from "./components/SplashScreen.svelte";
  import MapView from "./components/MapView.svelte";
  import PathView from "./components/PathView.svelte";
  import POIOverlay from "./components/POIOverlay.svelte";
  import LocationDetails from "./components/LocationDetails.svelte";
  import TopAppBar from "./components/TopAppBar.svelte";
  import BottomNav from "./components/BottomNav.svelte";
  import { activeScreen, appLoaded } from "./lib/stores";
  import MapView2 from "./components/MapView2.svelte";
  import MapView3 from "./components/MapView3.svelte";
  import PathView2 from "./components/PathView2.svelte";
  import PathView3 from "./components/PathView3.svelte";
    import PathView4 from "./components/PathView4.svelte";
    import MapView4 from "./components/MapView4.svelte";
    import MapView5 from "./components/MapView5.svelte";
    import PathView5 from "./components/PathView5.svelte";

  let ready = false;

  let innerHeight;

  onMount(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    appLoaded.set(true);
    ready = true;
  });
</script>

<svelte:window bind:innerHeight />

{#if !ready}
  <SplashScreen />
{:else}
  <div class="app-shell">
    <TopAppBar />
    <main>
      {#if $activeScreen === "map"}
        <MapView />
      {:else if $activeScreen === "map2"}
        <MapView2 />
      {:else if $activeScreen === "map3"}
        <MapView3 />
      {:else if $activeScreen === "map4"}
        <MapView4 />
      {:else if $activeScreen === "map5"}
        <MapView5 />
      {:else if $activeScreen === "path"}
        <PathView />
      {:else if $activeScreen === "path2"}
        <PathView2 />
      {:else if $activeScreen === "path3"}
        <PathView3 />
      {:else if $activeScreen === "path4"}
        <PathView4 />
       {:else if $activeScreen === "path5"}
        <PathView5 />
      {:else if $activeScreen === "poi"}
        <POIOverlay />
      {:else if $activeScreen === "location"}
        <LocationDetails />
      {/if}
    </main>
    <BottomNav />
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh; /* Use dynamic viewport height on mobile */
    overflow: hidden;
  }

  main {
    flex: 1;
    position: relative;
    background: #f9fafb;
    overflow: hidden;
    min-height: 0; /* Important for flex children */
  }
</style>
