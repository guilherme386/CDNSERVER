export interface TokenPayload {
  mediaId: string;
  mediaType: 'live' | 'vod' | 'series';
  streamId: string;
  extension: string;
  exp: number;
  iat: number;
  jti: string;
}

export interface XtreamCredentials {
  url: string;
  username: string;
  password: string;
}

export interface ProxyCredentials {
  url: string;
  username: string;
  password: string;
}

export interface XtreamMediaInfo {
  num: string;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  category_ids: number[];
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
  rating: string;
  rating_5based: number;
  added_timestamp: number;
  modified_timestamp: number;
  iptv_password: string;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface XtreamVodInfo {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  is_adult: string;
  category_id: string;
  category_ids: number[];
  custom_sid: string;
  direct_source: string;
  container_extension: string;
  description: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  duration_secs: number;
  duration: string;
  episode_run_time: string;
  added_timestamp: number;
  modified_timestamp: number;
}

export interface XtreamSeriesInfo {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
  category_ids: number[];
  customized_series: string;
  remote_url: string;
  added_timestamp: number;
  modified_timestamp: number;
}

export interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    tmdb_id: number | null;
    releasedate: string;
    plot: string;
    duration_secs: number;
    duration: string;
    movie_image: string;
    rating: number;
    name: string;
    season: number;
  };
  custom_sid: string;
  added: string;
  season: number;
  direct_source: string;
}

export interface MediaTokenRequest {
  mediaId: string;
  mediaType: 'live' | 'vod' | 'series';
  duration?: number;
}

export interface MediaTokenResponse {
  token: string;
  url: string;
  expiresAt: string;
  duration: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

export interface Env {
  XTREAM_URL: string;
  XTREAM_USERNAME: string;
  XTREAM_PASSWORD: string;
  PROXY_HOST: string;
  PROXY_PORT: string;
  PROXY_USER: string;
  PROXY_PASS: string;
  TOKEN_SECRET: string;
  CDN_DOMAIN: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_WINDOW: string;
  RATE_LIMIT_MAX: string;
  CACHE_TTL: string;
  ENVIRONMENT: string;
}
