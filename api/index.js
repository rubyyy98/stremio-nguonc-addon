const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

const MANIFEST = {
  id: 'org.nguonc.stremio.addon',
  version: '1.0.0',
  name: 'Nguonc Phim',
  description: 'Addon xem phim trực tuyến từ Nguonc.com',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'nguonc_catalog_movie',
      name: 'Nguonc - Phim Lẻ',
      extra: [{ name: 'search', isRequired: false }]
    },
    {
      type: 'series',
      id: 'nguonc_catalog_series',
      name: 'Nguonc - Phim Bộ',
      extra: [{ name: 'search', isRequired: false }]
    }
  ]
};

async function fetchNguonc(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for url: ${url}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err.message);
    return null;
  }
}

// 1. Manifest Endpoint
app.get('/manifest.json', (req, res) => {
  res.json(MANIFEST);
});

// 2. Catalog Endpoint
app.get('/catalog/:type/:id*', async (req, res) => {
  const { type, id } = req.params;
  const fullUrl = req.originalUrl || req.url;

  let search = null;
  if (req.query.search) {
    search = req.query.search;
  } else if (fullUrl.includes('search=')) {
    const match = fullUrl.match(/search=([^&.]+)/);
    if (match) search = decodeURIComponent(match[1]);
  }

  let endpoint = '';
  if (search) {
    endpoint = `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(search)}`;
  } else if (id.includes('nguonc_catalog_movie') || type === 'movie') {
    endpoint = `https://phim.nguonc.com/api/films/danh-sach/phim-le?page=1`;
  } else if (id.includes('nguonc_catalog_series') || type === 'series') {
    endpoint = `https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=1`;
  }

  let responseData = await fetchNguonc(endpoint);

  // Thử lại bằng endpoint danh sách mới nhất nếu danh mục theo loại bị lỗi
  if (!responseData || !responseData.items) {
    responseData = await fetchNguonc(`https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1`);
  }

  if (!responseData) return res.json({ metas: [] });

  const items = responseData.items || responseData.data?.items || responseData.data || [];

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ metas: [] });
  }

  const metas = items.map(item => ({
    id: `nguonc:${item.slug}`,
    type: type || (item.type === 'single' ? 'movie' : 'series'),
    name: item.name || item.origin_name || 'Phim',
    poster: item.thumb_url || item.poster_url,
    posterShape: 'poster',
    description: item.current_episode ? `Tập: ${item.current_episode}` : ''
  }));

  res.json({ metas });
});

// 3. Meta Endpoint
app.get('/meta/:type/:id*', async (req, res) => {
  const { type, id } = req.params;
  const cleanId = id.replace('.json', '');
  
  if (!cleanId.startsWith('nguonc:')) return res.json({ meta: {} });

  const slug = cleanId.replace('nguonc:', '');
  const responseData = await fetchNguonc(`https://phim.nguonc.com/api/film/${slug}`);
  
  const movie = responseData?.movie || responseData?.data?.movie;
  if (!movie) return res.json({ meta: {} });

  const videos = [];
  const episodes = movie.episodes || [];

  if (Array.isArray(episodes)) {
    episodes.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        serverData.forEach((ep, index) => {
          videos.push({
            id: `nguonc:${slug}:${ep.slug}`,
            title: ep.name || `Tập ${index + 1}`,
            season: 1,
            episode: index + 1,
            released: new Date().toISOString()
          });
        });
      }
    });
  }

  res.json({
    meta: {
      id: cleanId,
      type: type,
      name: movie.name,
      poster: movie.thumb_url || movie.poster_url,
      background: movie.poster_url || movie.thumb_url,
      description: movie.description ? movie.description.replace(/<[^>]*>?/gm, '') : '',
      genres: movie.category ? Object.values(movie.category).map(c => c.name) : [],
      videos: videos
    }
  });
});

// 4. Stream Endpoint
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');

  if (!cleanId.startsWith('nguonc:')) return res.json({ streams: [] });

  const parts = cleanId.split(':');
  const slug = parts[1];
  const epSlug = parts[2];

  const responseData = await fetchNguonc(`https://phim.nguonc.com/api/film/${slug}`);
  const movie = responseData?.movie || responseData?.data?.movie;
  if (!movie) return res.json({ streams: [] });

  const streams = [];
  const episodes = movie.episodes || [];

  if (Array.isArray(episodes)) {
    episodes.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        const ep = serverData.find(e => epSlug ? e.slug === epSlug : true);
        if (ep && ep.link_m3u8) {
          streams.push({
            title: `Nguonc [${server.server_name || 'Server'}] - ${ep.name}`,
            type: 'hls',
            url: ep.link_m3u8
          });
        }
      }
    });
  }

  res.json({ streams });
});

app.get('/', (req, res) => {
  res.redirect('/manifest.json');
});

module.exports = app;
