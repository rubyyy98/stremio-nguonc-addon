const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const API_HOST = 'https://phim.nguonc.com/api';

const builder = new addonBuilder({
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
});

async function fetchNguonc(url) {
  try {
    const res = await axios.get(url, { timeout: 5000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  let endpoint = '';
  
  if (extra && extra.search) {
    endpoint = `${API_HOST}/films/search?keyword=${encodeURIComponent(extra.search)}`;
  } else if (id === 'nguonc_catalog_movie') {
    endpoint = `${API_HOST}/films/danh-sach/phim-le?page=1`;
  } else if (id === 'nguonc_catalog_series') {
    endpoint = `${API_HOST}/films/danh-sach/phim-bo?page=1`;
  } else {
    return { metas: [] };
  }

  const data = await fetchNguonc(endpoint);
  if (!data || !data.items) return { metas: [] };

  const metas = data.items.map(item => ({
    id: `nguonc:${item.slug}`,
    type: type,
    name: item.name,
    poster: item.thumb_url,
    description: `Cập nhật: ${item.current_episode || ''}`
  }));

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (!id.startsWith('nguonc:')) return { meta: {} };
  const slug = id.replace('nguonc:', '');

  const data = await fetchNguonc(`${API_HOST}/film/${slug}`);
  if (!data || !data.movie) return { meta: {} };

  const movie = data.movie;
  const videos = [];

  if (movie.episodes && movie.episodes.length > 0) {
    movie.episodes.forEach(server => {
      if (server.server_data) {
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

  return {
    meta: {
      id: id,
      type: type,
      name: movie.name,
      poster: movie.thumb_url,
      background: movie.poster_url || movie.thumb_url,
      description: movie.description?.replace(/<[^>]*>?/gm, '') || '',
      genres: movie.category ? Object.values(movie.category).map(c => c.name) : [],
      videos: videos
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (!id.startsWith('nguonc:')) return { streams: [] };

  const parts = id.split(':');
  const slug = parts[1];
  const epSlug = parts[2];

  const data = await fetchNguonc(`${API_HOST}/film/${slug}`);
  if (!data || !data.movie) return { streams: [] };

  const streams = [];
  const episodes = data.movie.episodes || [];

  episodes.forEach(server => {
    if (server.server_data) {
      const ep = server.server_data.find(e => epSlug ? e.slug === epSlug : true);
      if (ep && ep.link_m3u8) {
        streams.push({
          title: `Nguonc [${server.server_name || 'HLS'}] - ${ep.name}`,
          type: 'hls',
          url: ep.link_m3u8
        });
      }
    }
  });

  return { streams };
});

const addonInterface = builder.getInterface();
module.exports = (req, res) => {
  if (req.url === '/') {
    res.writeHead(302, { Location: '/manifest.json' });
    res.end();
    return;
  }
  
  addonInterface(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
};
