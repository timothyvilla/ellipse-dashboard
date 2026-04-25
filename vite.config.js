import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Build configuration
  build: {
    // Generate sourcemaps for debugging but don't expose them publicly
    sourcemap: 'hidden',
    // Minify output
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.log in production
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['recharts'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  
  // Development server configuration
  server: {
    // Security headers for development
    headers: {
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',
      // XSS protection (legacy but still useful)
      'X-XSS-Protection': '1; mode=block',
      // Control referrer information
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Permissions policy
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    },
  },
  
  // Preview server configuration (for production builds)
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      // Content Security Policy
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // React requires unsafe-inline for now
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://s3.tradingview.com https://i.imgur.com https://i.ibb.co",
        "connect-src 'self' https://*.supabase.co https://open.er-api.com https://cdn-nfs.faireconomy.media https://nfs.faireconomy.media",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
  
  // Environment variable handling
  envPrefix: 'VITE_',
  
  // Define global constants
  define: {
    // Helps with production builds
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
})
