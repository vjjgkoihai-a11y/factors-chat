const { sanitizeVideoId, sanitizeText } = require('./sanitize');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube request failed with ${response.status}`);
  }

  return response.text();
}

function extractInitialData(html) {
  const patterns = [
    /var ytInitialData = (\{.*?\});<\/script>/s,
    /window\["ytInitialData"\] = (\{.*?\});/s,
    /ytInitialData\s*=\s*(\{.*?\});/s
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return JSON.parse(match[1]);
    }
  }

  throw new Error('Unable to extract ytInitialData');
}

function collectVideoRenderers(node, results = []) {
  if (!node || typeof node !== 'object') return results;

  if (node.videoRenderer) {
    results.push(node.videoRenderer);
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectVideoRenderers(item, results));
    return results;
  }

  Object.values(node).forEach((value) => collectVideoRenderers(value, results));
  return results;
}

function getText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((item) => item.text).join('');
  return '';
}

function parseVideoRenderer(renderer) {
  const videoId = sanitizeVideoId(renderer.videoId);
  if (!videoId) return null;
  const title = sanitizeText(getText(renderer.title), 140);
  if (!title) return null;

  return {
    id: videoId,
    title,
    channel: sanitizeText(getText(renderer.ownerText) || getText(renderer.longBylineText), 100),
    duration: sanitizeText(getText(renderer.lengthText) || 'LIVE', 20),
    views: sanitizeText(getText(renderer.viewCountText) || '0 views', 40),
    thumbnail: renderer.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  };
}

async function searchVideos(query) {
  const html = await fetchHtml(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
  const data = extractInitialData(html);
  const renderers = collectVideoRenderers(data);
  const videos = renderers.map(parseVideoRenderer).filter(Boolean).slice(0, 20);
  return videos;
}

async function autocomplete(query) {
  const response = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }
  });

  if (!response.ok) throw new Error(`Autocomplete failed with ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.[1]) ? data[1].slice(0, 8) : [];
}

module.exports = { searchVideos, autocomplete };
