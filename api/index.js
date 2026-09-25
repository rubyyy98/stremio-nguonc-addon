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
  version: '1.0.2',
  name: 'Phim Vietsub HD',
  description: 'Addon xem phim Vietsub phân loại Quốc gia tốc độ cao cho Stremio',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    // --- PHIM LẺ ---
    {
      type: 'movie',
      id: 'movie_all',
      name: 'Phim Lẻ - Tất Cả',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'movie_trung_quoc',
      name: 'Phim Lẻ - Trung Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'movie_han_quoc',
      name: 'Phim Lẻ - Hàn Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'movie_au_my',
      name: 'Phim Lẻ - Âu Mỹ',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    // --- PHIM BỘ ---
    {
      type: 'series',
      id: 'series_all',
      name: 'Phim Bộ - Tất Cả',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'series_trung_quoc',
      name: 'Phim Bộ - Trung Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'series_han_quoc',
      name: 'Phim Bộ - Hàn Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'series_au_my',
      name: 'Phim Bộ - Âu Mỹ',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'series_hoat_hinh',
      name: 'Phim Bộ - Hoạt Hình / Anime',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    }
  ]
};

// Fetch với timeout ngắn (3 giây)
async function fetchWithTimeout(url, timeoutMs = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) return await res.json();
  } catch (e) {
    return null;
  }
  return null;
}

// 1. Manifest
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

// 2. Catalog
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

  let skip = 0;
  if (req.query.skip) {
    skip = parseInt(req.query.skip) || 0;
  } else if (fullUrl.includes('skip=')) {
    const match = fullUrl.match(/skip=(\d+)/);
    if (match) skip = parseInt(match[1]) || 0;
  }

  const page = Math.floor(skip / 24) + 1;

  let kkUrl = '';
  let nguoncUrl = '';

  if (search) {
    kkUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&page=${page}`;
    nguoncUrl = `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(search)}&page=${page}`;
  } else {
    // Xử lý bộ lọc theo id catalog
    if (id.includes('trung_quoc')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/trung-quoc?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/trung-quoc?page=${page}`;
    } else if (id.includes('han_quoc')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/han-quoc?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/han-quoc?page=${page}`;
    } else if (id.includes('au_my')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/au-my?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/au-my?page=${page}`;
    } else if (id.includes('hoat_hinh')) {
      kkUrl = `https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/danh-sach/hoat-hinh?page=${page}`;
    } else {
      const isSeries = id.includes('series') || type === 'series';
      kkUrl = isSeries 
        ? `https://phimapi.com/v1/api/danh-sach/phim-bo?page=${page}` 
        : `https://phimapi.com/v1/api/danh-sach/phim-le?page=${page}`;
      nguoncUrl = isSeries 
        ? `https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=${page}` 
        : `https://phim.nguonc.com/api/films/danh-sach/phim-le?page=${page}`;
    }
  }

  // Gọi API lấy dữ liệu
  const dataKK = await fetchWithTimeout(kkUrl);
  let items = dataKK?.data?.items || [];

  if (!items.length) {
    const dataNguonc = await fetchWithTimeout(nguoncUrl);
    items = dataNguonc?.items || dataNguonc?.data?.items || [];
  }

  if (!Array.isArray(items) || !items.length) {
    return res.json({ metas: [] });
  }

  const metas = items.map(item => {
    let poster = item.poster_url || item.thumb_url || '';
    if (poster && !poster.startsWith('http')) {
      poster = `https://phimimg.com/${poster.startsWith('/') ? poster.slice(1) : poster}`;
    }

    return {
      id: `phim:${item.slug}`,
      type: type === 'series' ? 'series' : (item.type === 'single' ? 'movie' : 'series'),
      name: item.name || item.origin_name || 'Phim',
      poster: poster,
      posterShape: 'poster',
      description: item.current_episode ? `Tập: ${item.current_episode}` : ''
    };
  });

  res.json({ metas });
});

// 3. Meta
app.get('/meta/:type/:id*', async (req, res) => {
  const { type, id } = req.params;
  const cleanId = id.replace('.json', '');
  const slug = cleanId.replace('phim:', '').replace('nguonc:', '');

  const data = await fetchWithTimeout(`https://phimapi.com/phim/${slug}`) || 
               await fetchWithTimeout(`https://phim.nguonc.com/api/film/${slug}`);

  const movie = data?.movie || data?.data?.movie;
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

// 4. Stream
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');
  const parts = cleanId.replace('stream:', '').split(':');
  const slug = parts[0];
  const epSlug = parts[1];

  const data = await fetchWithTimeout(`https://phimapi.com/phim/${slug}`) || 
               await fetchWithTimeout(`https://phim.nguonc.com/api/film/${slug}`);

  const movie = data?.movie || data?.data?.movie;
  const episodes = data?.episodes || movie?.episodes || [];
  const streams = [];

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

app.get('/', (req, res) => res.redirect('/manifest.json'));

module.exports = app;
