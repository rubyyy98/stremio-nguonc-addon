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
  version: '1.0.5',
  name: 'Phim Vietsub HD',
  description: 'Addon xem phim Vietsub lọc sạch quảng cáo, tốc độ cao cho Stremio',
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

async function fetchWithTimeout(url, timeoutMs = 3500) {
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

// 1. Manifest Endpoint
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

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
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/han-quoc?page=${page}`;
    } else if (id.includes('au_my')) {
      kkUrl = `https://phimapi.com/v1/api/quoc-gia/au-my?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/quoc-gia/au-my?page=${page}`;
    } else if (id.includes('hoat_hinh')) {
      kkUrl = `https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${page}`;
      nguoncUrl = `https://phim.nguonc.com/api/films/danh-sach/hoat-hinh?page=${page}`;
    } else {
      const isSeries = id.includes('series') || type === 'series';
      kkUrl = isSeries ? `https://phimapi.com/v1/api/danh-sach/phim-bo?page=${page}` : `https://phimapi.com/v1/api/danh-sach/phim-le?page=${page}`;
      nguoncUrl = isSeries ? `https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=${page}` : `https://phim.nguonc.com/api/films/danh-sach/phim-le?page=${page}`;
    }
  }

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

// 3. Meta Endpoint
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

// 4. Stream Endpoint (Trả về link proxy đã lọc quảng cáo)
app.get('/stream/:type/:id*', async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace('.json', '');
  const parts = cleanId.replace('stream:', '').split(':');
  const slug = parts[0];
  const epSlug = parts[1];

  const host = req.get('host');
  const protocol = req.protocol || 'https';

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
        
        if (ep && ep.link_m3u8) {
          const proxyUrl = `${protocol}://${host}/m3u8?url=${encodeURIComponent(ep.link_m3u8)}`;
          streams.push({
            name: `[VIP Clean] ${server.server_name || 'HLS'}`,
            title: `Lọc Quảng Cáo - ${ep.name}`,
            type: 'hls',
            url: proxyUrl
          });
        }
      }
    });
  }

  res.json({ streams });
});

// 5. Proxy M3U8 Handler: Lọc sạch phân đoạn QC & Chuyển đổi Absolute URL chống đơ
app.get('/m3u8', async (req, res) => {
  const m3u8Url = req.query.url;
  if (!m3u8Url) return res.status(400).send('Missing url parameter');

  try {
    const response = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(m3u8Url).origin
      }
    });

    if (!response.ok) return res.status( response.status ).send('Error fetching m3u8');
    let content = await response.text();

    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    // Nếu là Master Playlist (chứa các sub-playlist 1080p, 720p...), tự động lấy playlist cao nhất
    if (content.includes('#EXT-X-STREAM-INF')) {
      const lines = content.split('\n');
      let subUrl = '';
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          subUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
          break;
        }
      }
      if (subUrl) {
        const subRes = await fetch(subUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': new URL(subUrl).origin
          }
        });
        if (subRes.ok) {
          content = await subRes.text();
        }
      }
    }

    // Tiến hành lọc bỏ quảng cáo & fix đường dẫn tuyệt đối cho các phân đoạn .ts
    const lines = content.split('\n');
    const newLines = [];
    let skipNext = false;

    // Từ khóa nhận diện các file quảng cáo thường gặp từ nguồn phim Việt Nam
    const adKeywords = ['qc', 'ads', 'intro', 'bet', '88', '888', 'nha-cai', 'shbet', '789', 'f8bet', 'jun88', 'hi88'];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        const nextLine = (lines[i + 1] || '').trim();
        const lowerLine = nextLine.toLowerCase();

        // Kiểm tra xem dòng kế tiếp có chứa từ khóa quảng cáo hay không
        if (adKeywords.some(kw => lowerLine.includes(kw))) {
          skipNext = true;
          continue;
        }
      }

      if (skipNext) {
        skipNext = false;
        continue;
      }

      // Đổi đường dẫn tương đối thành tuyệt đối để Stremio tải thẳng từ CDN nguồn
      if (line && !line.startsWith('#')) {
        if (!line.startsWith('http')) {
          line = new URL(line, baseUrl).href;
        }
      }

      newLines.push(line);
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(newLines.join('\n'));

  } catch (error) {
    res.status(500).send('Error processing M3U8: ' + error.message);
  }
});

app.get('/', (req, res) => res.redirect('/manifest.json'));

module.exports = app;
