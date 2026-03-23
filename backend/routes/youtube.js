const express = require('express');
const { autocomplete, searchVideos } = require('../utils/youtubeScraper');
const { sanitizeText } = require('../utils/sanitize');

const router = express.Router();

router.get('/search', async (req, res) => {
  const query = sanitizeText(req.query.q || '', 120);
  if (!query) {
    return res.status(400).json({ ok: false, error: 'Missing search query.' });
  }

  try {
    const results = await searchVideos(query);
    res.json({ ok: true, results });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Unable to fetch YouTube results.' });
  }
});

router.get('/autocomplete', async (req, res) => {
  const query = sanitizeText(req.query.q || '', 120);
  if (!query) {
    return res.json({ ok: true, suggestions: [] });
  }

  try {
    const suggestions = await autocomplete(query);
    res.json({ ok: true, suggestions });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Unable to fetch autocomplete.' });
  }
});

module.exports = router;
