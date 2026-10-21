import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: '/cms/static/',
  plugins: [{
    name: 'nexluck-home-styles',
    generateBundle() {
      for (const [name, source] of Object.entries({ 'home-base.css': '../../styles.css',
        'home-landing.css': '../../landing.css', 'home-design.css': '../../h/home.css',
        'dropdowns.css': '../../dropdowns.css' })) {
        this.emitFile({ type: 'asset', fileName: name,
          source: readFileSync(resolve(import.meta.dirname, source), 'utf8')
            .replaceAll("/dropdowns.css?v=202610131950", "./dropdowns.css") });
      }
    }
  }],
  build: {
    rollupOptions: {
      input: { editor: resolve(import.meta.dirname, 'src/editor.jsx'), renderer: resolve(import.meta.dirname, 'src/renderer.jsx'),
        docs: resolve(import.meta.dirname, 'src/docs.js') },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: '[name][extname]' }
    }
  }
});
