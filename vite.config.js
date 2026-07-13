import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import sri from 'vite-plugin-sri'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      // SRI: inject integrity= hashes on all <script> and <link> tags in index.html
      // This prevents a compromised CDN or build artifact from loading tampered scripts.
      sri(),
      viteStaticCopy({
        targets: [
          { src: 'manifest.json', dest: '.' },
          { src: 'public/qiubit-icon.svg', dest: '.' },
          { src: 'public/octra-icon.svg', dest: '.' }
        ]
      })
    ],

    build: {
      outDir: 'dist',
      sourcemap: false,
      emptyOutDir: true,
      minify: isProduction ? 'terser' : false,
      terserOptions: {
        compress: {
          // Drop all console output in production to prevent key material
          // leaking through error logs or stack traces in DevTools.
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'index.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
          contentScript: resolve(__dirname, 'src/inject/contentScript.js'),
          inpage: resolve(__dirname, 'src/inject/inpage/index.ts')
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // Background and inject scripts need predictable names
            if (chunkInfo.name === 'background') {
              return 'background.js';
            }
            if (chunkInfo.name === 'contentScript') {
              return 'contentScript.js';
            }
            if (chunkInfo.name === 'inpage') {
              return 'inpage.js';
            }
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: undefined
        }
      }
    },

    server: {
      proxy: {
        '/api': {
          target: env.VITE_RPC_URL || 'https://rpc.octra.network', // Fallback just in case env is missing during dev init, but intended to be from env
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },

    define: {
      'process.env.NODE_ENV': JSON.stringify(mode)
    }
  }
})
