const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const API_HOST = 'https://phim.nguonc.com/api';

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
    const res = await axios.get(url, { 
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.data;
  } catch (err) {
    return null;
  }
}

// 1. Manifest Endpoint
app.get('/manifest.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(MANIFEST);
});

// 2. Catalog Endpoint (Fix EmptyContent)
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, id, extra } = req.params;

  let search = null;
  if (extra) {
    const searchMatch = extra.match(/search=([^&]+)/);
    if (searchMatch) search = decodeURIComponent(searchMatch[1]);
  }

  let endpoint = '';
  if (search) {
    endpoint = `${API_HOST}/films/search?keyword=${encodeURIComponent(search)}`;
  } else if (id === 'nguonc_catalog_movie') {
    endpoint = `${API_HOST}/films/danh-sach/phim-le?page=1`;
  } else if (id === 'nguonc_catalog_series') {
    endpoint = `${API_HOST}/films/danh-sach/phim-bo?page=1`;
  } else {
    return res.json({ metas: [] });
  }

  const data = await fetchNguonc(endpoint);
  if (!data || !data.items || !Array.isArray(data.items)) {
    return res.json({ metas: [] });
  }

  const metas = data.items.map(item => ({
    id: `nguonc:${item.slug}`,
    type: type,
    name: item.name || item.origin_name || 'Chưa có tên',
    poster: item.thumb_url || item.poster_url,
    posterShape: 'poster',
    description: item.current_episode ? `Trạng thái: ${item.current_episode}` : ''
  }));

  res.json({ metas });
});

// Support fallback route cho Catalog không có extra param
app.get('/catalog/:type/:id.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, id } = req.params;

  let endpoint = '';
  if (id === 'nguonc_catalog_movie') {
    endpoint = `${API_HOST}/films/danh-sach/phim-le?page=1`;
  } else if (id === 'nguonc_catalog_series') {
    endpoint = `${API_HOST}/films/danh-sach/phim-bo?page=1`;
  } else {
    return res.json({ metas: [] });
  }

  const data = await fetchNguonc(endpoint);
  if (!data || !data.items || !Array.isArray(data.items)) {
    return res.json({ metas: [] });
  }

  const metas = data.items.map(item => ({
    id: `nguonc:${item.slug}`,
    type: type,
    name: item.name || item.origin_name || 'Chưa có tên',
    poster: item.thumb_url || item.poster_url,
    posterShape: 'poster',
    description: item.current_episode ? `Trạng thái: ${item.current_episode}` : ''
  }));

  res.json({ metas });
});

// 3. Meta Endpoint
app.get('/meta/:type/:id.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, id } = req.params;
  if (!id.startsWith('nguonc:')) return res.json({ meta: {} });

  const slug = id.replace('nguonc:', '');
  const data = await fetchNguonc(`${API_HOST}/film/${slug}`);
  if (!data || !data.movie) return res.json({ meta: {} });

  const movie = data.movie;
  const videos = [];

  if (movie.episodes && Array.isArray(movie.episodes)) {
    movie.episodes.forEach(server => {
      if (server.server_data && Array.isArray(server.server_data)) {
        server.server_data.forEach((ep, index) => {
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
      id: id,
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
app.get('/stream/:type/:id.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id } = req.params;
  if (!id.startsWith('nguonc:')) return res.json({ streams: [] });

  const parts = id.split(':');
  const slug = parts[1];
  const epSlug = parts[2];

  const data = await fetchNguonc(`${API_HOST}/film/${slug}`);
  if (!data || !data.movie) return res.json({ streams: [] });

  const streams = [];
  const episodes = data.movie.episodes || [];

  episodes.forEach(server => {
    if (server.server_data && Array.isArray(server.server_data)) {
      const ep = server.server_data.find(e => epSlug ? e.slug === epSlug : true);
      if (ep && ep.link_m3u8) {
        streams.push({
          title: `Nguonc [${server.server_name || 'Server'}] - ${ep.name}`,
          type: 'hls',
          url: ep.link_m3u8
        });
      }
    }
  });

  res.json({ streams });
});

app.get('/', (req, res) => {
  res.redirect('/manifest.json');
});

module.exports = app;
