const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

const MANIFEST = {
  id: 'org.nguonc.stremio.addon',
  version: '1.5.0',
  name: 'Phim Vietsub HD Direct',
  description: 'Addon xem phim Vietsub tốc độ cao cho Stremio',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'movie_all', name: 'Phim Lẻ - Tất Cả', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'movie_trung_quoc', name: 'Phim Lẻ - Trung Quốc', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'movie_han_quoc', name: 'Phim Lẻ - Hàn Quốc', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'movie_au_my', name: 'Phim Lẻ - Âu Mỹ', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'series_all', name: 'Phim Bộ - Tất Cả', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'series_trung_quoc', name: 'Phim Bộ - Trung Quốc', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'series_han_quoc', name: 'Phim Bộ - Hàn Quốc', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'series_au_my', name: 'Phim Bộ - Âu Mỹ', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'series_hoat_hinh', name: 'Phim Bộ - Hoạt Hình / Anime', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] }
  ]
};

async function fetchWithTimeout(url, timeoutMs = 4000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
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
  let kkUrl = '', nguoncUrl = '';

  if (search) {
    kkUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&page=${page}`;
    nguoncUrl = `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(search)}&page=${page}`;
  } else {
    if (id.includes('trung_quoc')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/trung-quoc?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/trung-quoc?page=${page}`;
    } else if (id.includes('han_quoc')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/han-quoc?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/han-quoc?page=${page}`;
    } else if (id.includes('au_my')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/au-my?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/au-my?page=${page}`;
    } else if (id.includes('hoat_hinh')) {
      kkUrl = `https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/danh-sach/hoat-hinh?page=${page}`;
    } else {
      const isSeries = id.includes('series') || type === 'series';
      kkUrl = isSeries ? `https://phimapi.com/v1/api/danh-sach/phim-bo?page=${page}` : `https://phimapi.com/v1/api/danh-sach/phim-le?page=${page}`;
      nguoncUrl = isSeries ? `https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=${page}` : `https://phim.nguonc.com/api/films/danh-sach/phim-le?page=${page}`;
    }
  }

  const [dataKK, dataNguonc] = await Promise.all([
    fetchWithTimeout(kkUrl),
    fetchWithTimeout(nguoncUrl)
  ]);

  const itemsKK = dataKK?.data?.items || [];
  const itemsNC = dataNguonc?.items || dataNguonc?.data?.items || [];
  const combined = [...itemsKK, ...itemsNC];
  const uniqueMap = new Map();

  combined.forEach(item => {
    if (item && item.slug && !uniqueMap.has(item.slug)) {
      uniqueMap.set(item.slug, item);
    }
  });

  const items = Array.from(uniqueMap.values());
  if (!items.length) return res.json({ metas: [] });

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

  const [dataKK, dataNC] = await Promise.all([
    fetchWithTimeout(`https://phimapi.com/phim/${slug}`),
    fetchWithTimeout(`https://phim.nguonc.com/api/film/${slug}`)
  ]);

  const movie = dataKK?.movie || dataNC?.movie || dataNC?.data?.movie;
  if (!movie) return res.json({ meta: {} });

  let posterUrl = movie.poster_url || movie.thumb_url || '';
  if (posterUrl && !posterUrl.startsWith('http')) {
    posterUrl = `https://phimimg.com/${posterUrl.startsWith('/') ? posterUrl.slice(1) : posterUrl}`;
  }

  const videos = [];
  const episodesKK = dataKK?.episodes || movie?.episodes || [];
  const episodesNC = dataNC?.episodes || [];
  const allEpisodes = [...episodesKK, ...episodesNC];

  if (Array.isArray(allEpisodes)) {
    allEpisodes.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        serverData.forEach((ep, index) => {
          if (!videos.some(v => v.episode === index + 1)) {
            videos.push({
              id: `stream:${slug}:${ep.slug || index}`,
              title: ep.name || `Tập ${index + 1}`,
              season: 1,
              episode: index + 1,
              released: new Date().toISOString()
            });
          }
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

// 4. Stream Endpoint Direct Stream
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');
  const parts = cleanId.replace('stream:', '').split(':');
  const slug = parts[0];
  const epSlug = parts[1];

  const [dataKK, dataNC] = await Promise.all([
    fetchWithTimeout(`https://phimapi.com/phim/${slug}`),
    fetchWithTimeout(`https://phim.nguonc.com/api/film/${slug}`)
  ]);

  const streams = [];

  const processEpisodes = (episodes, sourceName, defaultReferer) => {
    if (!Array.isArray(episodes)) return;
    episodes.forEach((server, sIdx) => {
      const serverData = server.server_data || [];
      const ep = serverData.find((e, idx) => epSlug ? (e.slug === epSlug || idx.toString() === epSlug) : true);
      
      if (ep && ep.link_m3u8) {
        let refererHeader = defaultReferer;
        try {
          refererHeader = new URL(ep.link_m3u8).origin + '/';
        } catch (e) {}

        streams.push({
          name: `[${sourceName}]`,
          title: `${server.server_name || 'Server ' + (sIdx + 1)} - ${ep.name}`,
          type: 'hls',
          url: ep.link_m3u8,
          behaviorHints: {
            notSupported: false,
            proxyHeaders: {
              request: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': refererHeader
              }
            }
          }
        });
      }
    });
  };

  processEpisodes(dataKK?.episodes || dataKK?.movie?.episodes, 'PhimAPI', 'https://phimapi.com/');
  processEpisodes(dataNC?.episodes || dataNC?.movie?.episodes, 'NguonC', 'https://phim.nguonc.com/');

  res.json({ streams });
});

app.get('*', (req, res) => res.redirect('/manifest.json'));

module.exports = app;
