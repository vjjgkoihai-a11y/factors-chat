export async function searchYouTube(query) {
  const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Search failed');
  return data.results || [];
}

export async function fetchAutocomplete(query) {
  const response = await fetch(`/api/youtube/autocomplete?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Autocomplete failed');
  return data.suggestions || [];
}
