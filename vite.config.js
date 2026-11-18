import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeSiteUrl(rawValue) {
  if (!rawValue) return '';
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('VITE_SITE_URL must be a valid absolute HTTPS URL, for example https://sketchai.example');
  }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_SITE_URL must be the HTTPS origin only, for example https://sketchai.example');
  }
  return parsed.origin;
}

function searchMetadataPlugin(siteUrl) {
  return {
    name: 'sketchai-search-metadata',
    transformIndexHtml: {
      handler(html) {
        const jsonLdPattern = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
        const htmlWithSchema = html.replace(jsonLdPattern, (_match, open, json, close) => {
          const data = JSON.parse(json);
          const application = data['@graph']?.find((item) => item['@type'] === 'WebApplication');
          if (application) {
            delete application.url;
            delete application['@id'];
            if (siteUrl) {
              application.url = `${siteUrl}/`;
              application['@id'] = `${siteUrl}/#app`;
            }
          }
          return `${open}\n      ${JSON.stringify(data, null, 2)}\n    ${close}`;
        });
        if (!siteUrl) {
          return htmlWithSchema
            .replace(/^\s*<link rel="canonical"[^>]*>\s*$/m, '')
            .replace(/^\s*<meta property="og:url"[^>]*>\s*$/m, '');
        }
        const absoluteUrl = `${siteUrl}/`;
        const imageUrl = `${siteUrl}/social-preview.png`;
        return htmlWithSchema.replace('</head>', [
          `    <link rel="canonical" href="${absoluteUrl}" />`,
          `    <meta property="og:url" content="${absoluteUrl}" />`,
          `    <meta property="og:image" content="${imageUrl}" />`,
          '    <meta property="og:image:width" content="1200" />',
          '    <meta property="og:image:height" content="630" />',
          '    <meta property="og:image:alt" content="SketchAI AI drawing studio showing a sketch and ranked AI ideas" />',
          `    <meta name="twitter:image" content="${imageUrl}" />`,
          '    <meta name="twitter:image:alt" content="SketchAI AI drawing studio showing a sketch and ranked AI ideas" />',
          '  </head>',
        ].join('\n'));
      },
    },
    generateBundle() {
      if (!siteUrl) return;
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>\n`,
      });
    },
    async writeBundle(outputOptions) {
      if (!siteUrl || !outputOptions.dir) return;
      const robotsPath = path.join(outputOptions.dir, 'robots.txt');
      const currentRobots = await readFile(robotsPath, 'utf8').catch(() => 'User-agent: *\nAllow: /\n');
      const sitemapLine = `Sitemap: ${siteUrl}/sitemap.xml`;
      if (!currentRobots.includes(sitemapLine)) {
        await writeFile(robotsPath, `${currentRobots.trimEnd()}\n${sitemapLine}\n`);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL);
  return {
    plugins: [react(), searchMetadataPlugin(siteUrl)],
    // Relative base so the static build works from any subpath (GitHub Pages,
    // a project folder on Vercel, plain static hosting).
    base: './',
    build: {
      rollupOptions: {
        output: {
          // TensorFlow.js is large by nature; keeping it in its own chunk means the
          // interface and its cached copy are not invalidated by app-only changes.
          manualChunks: {
            tfjs: ['@tensorflow/tfjs'],
            react: ['react', 'react-dom', 'react-dom/client', 'react-dom/server'],
          },
        },
      },
      chunkSizeWarningLimit: 1700, // tfjs is one 1.6 MB vendor chunk by nature
    },
    server: { host: '0.0.0.0', allowedHosts: true },
    preview: { host: '0.0.0.0', allowedHosts: true },
  };
});
