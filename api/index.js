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
  description: 'Addon xem phim trực tuyến từ Nguonc.com & OPhim',
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

// Hàm Fetch thông minh lách Cloudflare & tự động fallback nguồn API dự phòng
async function fetchApiData(url, fallbackUrl = null) {
  const proxyList = [
    (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    (target) => target
  ];

  // 1. Thử các proxy với Nguonc API
  for (const getProxyUrl of proxyList) {
    try {
      const fetchUrl = getProxyUrl(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = null;
        }

        if (data && (data.items || data.movie || data.data?.items || data.data)) {
          return { data, source: 'nguonc' };
        }
      }
    } catch (err) {
      // Tiếp tục thử proxy tiếp theo
    }
  }

  // 2. Nếu Nguonc hoàn toàn bị IP Block, chuyển tự động sang OPhim API làm fallback
  if (fallbackUrl) {
    try {
      const response = await fetch(fallbackUrl, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        return { data, source: 'ophim' };
      }
    } catch (e) {
      // Fallback failed
    }
  }

  return null;
}

// 1. Manifest
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

  let nguoncUrl = '';
  let ophimUrl = '';

  if (search) {
    nguoncUrl = `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(search)}`;
    ophimUrl = `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}`;
  } else if (id.includes('nguonc_catalog_movie') || type === 'movie') {
    nguoncUrl = `https://phim.nguonc.com/api/films/danh-sach/phim-le?page=1`;
    ophimUrl = `https://ophim1.com/v1/api/danh-sach/phim-le?page=1`;
  } else if (id.includes('nguonc_catalog_series') || type === 'series') {
    nguoncUrl = `https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=1`;
    ophimUrl = `https://ophim1.com/v1/api/danh-sach/phim-bo?page=1`;
  } else {
    nguoncUrl = `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1`;
    ophimUrl = `https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=1`;
  }

  const result = await fetchApiData(nguoncUrl, ophimUrl);

  if (!result || !result.data) return res.json({ metas: [] });

  const { data, source } = result;
  let items = [];

  if (source === 'nguonc') {
    items = data.items || data.data?.items || data.data || [];
  } else {
    items = data.data?.items || data.items || [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ metas: [] });
  }

  const metas = items.map(item => {
    let slug = item.slug;
    let name = item.name || item.origin_name || 'Phim';
    let poster = item.thumb_url || item.poster_url || '';

    if (poster && !poster.startsWith('http')) {
      poster = source === 'nguonc' 
        ? `https://phim.nguonc.com${poster.startsWith('/') ? '' : '/'}${poster}`
        : `https://img.ophim.live/uploads/movies/${poster}`;
    }

    return {
      id: `${source}:${slug}`,
      type: type === 'series' ? 'series' : (item.type === 'single' ? 'movie' : 'series'),
      name: name,
      poster: poster,
      posterShape: 'poster',
      description: item.current_episode ? `Tập: ${item.current_episode}` : ''
    };
  });

  res.json({ metas });
});

// 3. Meta Endpoint
app.get('/meta/:type/:id*', async (req, res) => {
  const { type, id } = req.params;
  const cleanId = id.replace('.json', '');
  
  const parts = cleanId.split(':');
  if (parts.length < 2) return res.json({ meta: {} });

  const source = parts[0];
  const slug = parts[1];

  let movie = null;
  let episodes = [];

  if (source === 'nguonc') {
    const resData = await fetchApiData(`https://phim.nguonc.com/api/film/${slug}`, `https://ophim1.com/v1/api/phim/${slug}`);
    movie = resData?.data?.movie || resData?.data?.data?.movie;
  } else {
    const resData = await fetchApiData(`https://ophim1.com/v1/api/phim/${slug}`);
    movie = resData?.data?.data?.item || resData?.data?.movie;
  }

  if (!movie) return res.json({ meta: {} });

  let posterUrl = movie.thumb_url || movie.poster_url || '';
  if (posterUrl && !posterUrl.startsWith('http')) {
    posterUrl = source === 'nguonc' 
      ? `https://phim.nguonc.com${posterUrl.startsWith('/') ? '' : '/'}${posterUrl}`
      : `https://img.ophim.live/uploads/movies/${posterUrl}`;
  }

  const videos = [];
  const epArray = movie.episodes || [];

  if (Array.isArray(epArray)) {
    epArray.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        serverData.forEach((ep, index) => {
          videos.push({
            id: `${source}:${slug}:${ep.slug}`,
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
      description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : (movie.description ? movie.description.replace(/<[^>]*>?/gm, '') : ''),
      genres: movie.category ? (Array.isArray(movie.category) ? movie.category.map(c => c.name) : Object.values(movie.category).map(c => c.name)) : [],
      videos: videos
    }
  });
});

// 4. Stream Endpoint
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');

  const parts = cleanId.split(':');
  if (parts.length < 2) return res.json({ streams: [] });

  const source = parts[0];
  const slug = parts[1];
  const epSlug = parts[2];

  let movie = null;
  if (source === 'nguonc') {
    const resData = await fetchApiData(`https://phim.nguonc.com/api/film/${slug}`, `https://ophim1.com/v1/api/phim/${slug}`);
    movie = resData?.data?.movie || resData?.data?.data?.movie;
  } else {
    const resData = await fetchApiData(`https://ophim1.com/v1/api/phim/${slug}`);
    movie = resData?.data?.data?.item || resData?.data?.movie;
  }

  if (!movie) return res.json({ streams: [] });

  const streams = [];
  const epArray = movie.episodes || [];

  if (Array.isArray(epArray)) {
    epArray.forEach(server => {
      const serverData = server.server_data || [];
      if (Array.isArray(serverData)) {
        const ep = serverData.find(e => epSlug ? e.slug === epSlug : true);
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
