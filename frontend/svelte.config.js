import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    hydratable: true
  }
};

export default config;
