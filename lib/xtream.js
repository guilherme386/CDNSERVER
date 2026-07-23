class XtreamService {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.url.replace(/\/+$/, '');
  }

  getAuthUrl(action, params = {}) {
    const url = new URL(`${this.baseUrl}/player_api.php`);
    url.searchParams.set('username', this.credentials.username);
    url.searchParams.set('password', this.credentials.password);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async getLiveCategories() {
    const url = this.getAuthUrl('get_live_categories');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getLiveStreams(categoryId) {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_live_streams', params);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getVodCategories() {
    const url = this.getAuthUrl('get_vod_categories');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getVodStreams(categoryId) {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_vod_streams', params);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getVodInfo(vodId) {
    const url = this.getAuthUrl('get_vod_info', { vod_id: vodId });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getSeriesCategories() {
    const url = this.getAuthUrl('get_series_categories');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getSeries(categoryId) {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_series', params);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getSeriesInfo(seriesId) {
    const url = this.getAuthUrl('get_series_info', { series_id: seriesId });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async getSeriesEpisodes(seriesId, season) {
    const url = this.getAuthUrl('get_series_info', { series_id: seriesId, season: String(season) });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const seasonKey = String(season);
    return data.episodes?.[seasonKey] || [];
  }

  async getMediaInfo(streamId, mediaType) {
    try {
      switch (mediaType) {
        case 'live': {
          const streams = await this.getLiveStreams();
          const stream = streams.find(s => String(s.stream_id) === streamId);
          return stream ? { name: stream.name } : null;
        }
        case 'vod': {
          const info = await this.getVodInfo(streamId);
          return info ? { name: info.name, duration: info.duration_secs } : null;
        }
        case 'series': {
          const info = await this.getSeriesInfo(streamId);
          return info ? { name: info.name } : null;
        }
      }
    } catch {
      return null;
    }
  }
}

module.exports = { XtreamService };
