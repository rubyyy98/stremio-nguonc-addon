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
  name: 'Phim Vietsub (Nguonc & KKPhim)',
  description: 'Xem phim Vietsub HD trực tuyến cho Stremio',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'nguonc_catalog_movie',
      name: 'Phim Lẻ Vietsub',
      extra: [{ name: 'search', isRequired: false }]
    },
    {
      type: 'series',
      id: 'nguonc_catalog_series',
      name: 'Phim Bộ Vietsub',
      extra: [{ name: 'search', isRequired: false }]
    }
  ]
};

// Hàm gửi request an toàn với Timeout
async function safeFetchJson(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Return null if request fails or times out
  }
  return null;
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

  let items = [];

  if (search) {
    // Thử KKPhim Search
    let data = await safeFetchJson(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}`);
    items = data?.data?.items || [];

    // Nếu rỗng thử Nguonc Search
    if (items.length === 0) {
      data = await safeFetchJson(`https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(search)}`);
      items = data?.items || data?.data?.items || [];
    }
  } else {
    let urlKK = 'https://phimapi.com/v1/api/danh-sach/phim-le?page=1';
    let urlNguonc = 'https://phim.nguonc.com/api/films/danh-sach/phim-le?page=1';

    if (id.includes('series') || type === 'series') {
      urlKK = 'https://phimapi.com/v1/api/danh-sach/phim-bo?page=1';
      urlNguonc = 'https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=1';
    }

    // Ưu tiên KKPhim/PhimAPI (Tốc độ cao & không block Vercel)
    let data = await safeFetchJson(urlKK);
    items = data?.data?.items || [];

    // Fallback sang Nguonc
    if (items.length === 0) {
      data = await safeFetchJson(urlNguonc);
      items = data?.items || data?.data?.items || [];
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ metas: [] });
  }

  const metas = items.map(item => {
    let poster = item.poster_url || item.thumb_url || '';
    
    if (poster && !poster.startsWith('http')) {
      const cdnUrl = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
      poster = `${cdnUrl}/${poster.startsWith('/') ? poster.slice(1) : poster}`;
    }

    return {
      id: `phim:${item.slug}`,
      type: type === 'series' ? 'series' : (item.type === 'single' ? 'movie' : 'series'),
      name: item.name || item.origin_name || 'Phim',
      poster: poster,
      posterShape: 'poster',
      description: item.current_episode ? `Trạng thái: ${item.current_episode}` : (item.year ? `Năm: ${item.year}` : '')
    };
  });

  res.json({ metas });
});

// 3. Meta Endpoint
app.get('/meta/:type/:id*', async (req, res) => {
  const { type, id } = req.params;
  const cleanId = id.replace('.json', '');
  const slug = cleanId.replace('phim:', '').replace('nguonc:', '');

  let data = await safeFetchJson(`https://phimapi.com/phim/${slug}`);
  let movie = data?.movie;

  if (!movie) {
    data = await safeFetchJson(`https://phim.nguonc.com/api/film/${slug}`);
    movie = data?.movie || data?.data?.movie;
  }

  if (!movie) return res.json({ meta: {} });

  let posterUrl = movie.poster_url || movie.thumb_url || '';
  if (posterUrl && !posterUrl.startsWith('http')) {
    posterUrl = `https://phimimg.com/${posterUrl.startsWith('/') ? posterUrl.slice(1) : posterUrl}`;
  }

  const videos = [];
  const episodes = movie.episodes || data?.episodes || [];

  if (Array.isArray(episodes)) {
    episodes.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        serverData.forEach((ep, index) => {
          videos.push({
            id: `stream:${slug}:${ep.slug || index}`,
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
      poster: posterUrl,
      background: posterUrl,
      description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : '',
      genres: movie.category ? (Array.isArray(movie.category) ? movie.category.map(c => c.name) : Object.values(movie.category).map(c => c.name)) : [],
      videos: videos
    }
  });
});

// 4. Stream Endpoint
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');
  const parts = cleanId.replace('stream:', '').split(':');

  const slug = parts[0];
  const epSlug = parts[1];

  let streams = [];

  // Thử nguồn PhimAPI / KKPhim
  let data = await safeFetchJson(`https://phimapi.com/phim/${slug}`);
  let movie = data?.movie;
  let episodes = data?.episodes || movie?.episodes || [];

  if (!movie) {
    data = await safeFetchJson(`https://phim.nguonc.com/api/film/${slug}`);
    movie = data?.movie || data?.data?.movie;
    episodes = movie?.episodes || [];
  }

  if (Array.isArray(episodes)) {
    episodes.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        const ep = serverData.find((e, idx) => epSlug ? (e.slug === epSlug || idx.toString() === epSlug) : true);
        if (ep && (ep.link_m3u8 || ep.link_embed)) {
          streams.push({
            title: `Server [${server.server_name || 'VIP'}] - ${ep.name}`,
            type: 'hls',
            url: ep.link_m3u8 || ep.link_embed
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
