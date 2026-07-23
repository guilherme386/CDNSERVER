import { logger } from '../utils/logger.js';

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ProxyFetchOptions extends RequestInit {
  timeout?: number;
}

export class ProxyService {
  private proxyUrl: string;
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
    this.proxyUrl = `http://${config.username}:${config.password}@${config.host}:${config.port}`;
  }

  private buildProxyRequest(targetUrl: string, options: ProxyFetchOptions = {}): { url: string; init: RequestInit } {
    const { timeout: _timeout, ...fetchOptions } = options;

    const proxyReqUrl = new URL(this.proxyUrl);
    proxyReqUrl.searchParams.set('url', targetUrl);

    const init: RequestInit = {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
      },
    };

    return { url: proxyReqUrl.toString(), init };
  }

  async fetch(targetUrl: string, options: ProxyFetchOptions = {}): Promise<Response> {
    const { url, init } = this.buildProxyRequest(targetUrl, options);

    logger.debug('Proxy fetch', { targetUrl: targetUrl.substring(0, 100) });

    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        logger.warn('Proxy fetch failed', {
          targetUrl: targetUrl.substring(0, 100),
          status: response.status,
        });
      }

      return response;
    } catch (error) {
      logger.error('Proxy fetch error', {
        targetUrl: targetUrl.substring(0, 100),
        error: String(error),
      });
      throw error;
    }
  }

  async fetchStream(targetUrl: string, options: ProxyFetchOptions = {}): Promise<Response> {
    const { url, init } = this.buildProxyRequest(targetUrl, {
      ...options,
      headers: {
        ...options.headers,
        'Connection': 'keep-alive',
      },
    });

    logger.debug('Proxy stream', { targetUrl: targetUrl.substring(0, 100) });

    try {
      const response = await fetch(url, init);
      return response;
    } catch (error) {
      logger.error('Proxy stream error', {
        targetUrl: targetUrl.substring(0, 100),
        error: String(error),
      });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.proxyUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return response.ok || response.status === 405;
    } catch {
      return false;
    }
  }
}

export function createProxyService(config: ProxyConfig): ProxyService {
  return new ProxyService(config);
}
