import type {
  XtreamCredentials,
  XtreamMediaInfo,
  XtreamCategory,
  XtreamVodInfo,
  XtreamSeriesInfo,
  XtreamEpisode,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export class XtreamService {
  private credentials: XtreamCredentials;
  private baseUrl: string;

  constructor(credentials: XtreamCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.url.replace(/\/+$/, '');
  }

  private getAuthUrl(action: string, params: Record<string, string> = {}): string {
    const url = new URL(`${this.baseUrl}/player_api.php`);
    url.searchParams.set('username', this.credentials.username);
    url.searchParams.set('password', this.credentials.password);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private getStreamUrl(streamId: string, extension: string): string {
    return `${this.baseUrl}/movie/${this.credentials.username}/${this.credentials.password}/${streamId}.${extension}`;
  }

  private getLiveStreamUrl(streamId: string): string {
    return `${this.baseUrl}/live/${this.credentials.username}/${this.credentials.password}/${streamId}.m3u8`;
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    const url = this.getAuthUrl('get_live_categories');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamCategory[];
    } catch (error) {
      logger.error('Failed to fetch live categories', { error: String(error) });
      return [];
    }
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamMediaInfo[]> {
    const params: Record<string, string> = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_live_streams', params);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamMediaInfo[];
    } catch (error) {
      logger.error('Failed to fetch live streams', { error: String(error) });
      return [];
    }
  }

  async getVodCategories(): Promise<XtreamCategory[]> {
    const url = this.getAuthUrl('get_vod_categories');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamCategory[];
    } catch (error) {
      logger.error('Failed to fetch VOD categories', { error: String(error) });
      return [];
    }
  }

  async getVodStreams(categoryId?: string): Promise<XtreamVodInfo[]> {
    const params: Record<string, string> = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_vod_streams', params);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamVodInfo[];
    } catch (error) {
      logger.error('Failed to fetch VOD streams', { error: String(error) });
      return [];
    }
  }

  async getVodInfo(vodId: string): Promise<XtreamVodInfo | null> {
    const url = this.getAuthUrl('get_vod_info', { vod_id: vodId });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamVodInfo;
    } catch (error) {
      logger.error('Failed to fetch VOD info', { error: String(error) });
      return null;
    }
  }

  async getSeriesCategories(): Promise<XtreamCategory[]> {
    const url = this.getAuthUrl('get_series_categories');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamCategory[];
    } catch (error) {
      logger.error('Failed to fetch series categories', { error: String(error) });
      return [];
    }
  }

  async getSeries(categoryId?: string): Promise<XtreamSeriesInfo[]> {
    const params: Record<string, string> = {};
    if (categoryId) params.category_id = categoryId;
    const url = this.getAuthUrl('get_series', params);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamSeriesInfo[];
    } catch (error) {
      logger.error('Failed to fetch series', { error: String(error) });
      return [];
    }
  }

  async getSeriesInfo(seriesId: string): Promise<XtreamSeriesInfo | null> {
    const url = this.getAuthUrl('get_series_info', { series_id: seriesId });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as XtreamSeriesInfo;
    } catch (error) {
      logger.error('Failed to fetch series info', { error: String(error) });
      return null;
    }
  }

  async getSeriesEpisodes(seriesId: string, season: number): Promise<XtreamEpisode[]> {
    const url = this.getAuthUrl('get_series_info', { series_id: seriesId, season: String(season) });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { episodes?: Record<string, XtreamEpisode[]> };
      const seasonKey = String(season);
      return data.episodes?.[seasonKey] || [];
    } catch (error) {
      logger.error('Failed to fetch series episodes', { error: String(error) });
      return [];
    }
  }

  getMediaUrl(streamId: string, extension: string, mediaType: 'live' | 'vod' | 'series'): string {
    switch (mediaType) {
      case 'live':
        return this.getLiveStreamUrl(streamId);
      case 'vod':
      case 'series':
        return this.getStreamUrl(streamId, extension);
      default:
        throw new Error(`Unknown media type: ${mediaType}`);
    }
  }

  async getMediaInfo(streamId: string, mediaType: 'live' | 'vod' | 'series'): Promise<{ name: string; duration?: number } | null> {
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
