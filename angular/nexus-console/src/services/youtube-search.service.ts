import { Injectable, inject } from '@angular/core';
import { YoutubeSearchResult } from '../models/youtube-search-result.model.js';
import { BrokerService } from './broker.service.js';

export interface YoutubeSearchParams {
  brokerUrl: string;
  token: string;
  query: string;
}

// Response item shape from the Spring broker's youtubeSearchService.searchVideos
interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  videoId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

interface SearchResult {
  items: SearchResultItem[];
}

@Injectable({
  providedIn: 'root',
})
export class YoutubeSearchService {
  private brokerService = inject(BrokerService);

  private constructBrokerUrl(baseUrl: string): string {
    let fullUrl = baseUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `http://${fullUrl}`;
    }
    if (fullUrl.endsWith('/')) {
      fullUrl = fullUrl.slice(0, -1);
    }
    fullUrl += '/api/v1/broker/submitRequest';
    return fullUrl;
  }

  async search(params: YoutubeSearchParams): Promise<YoutubeSearchResult[]> {
    if (!params.brokerUrl) {
      console.warn('YoutubeSearchService: No brokerUrl provided. Returning empty results.');
      return [];
    }
    if (!params.token) {
      console.warn('YoutubeSearchService: No token provided. Returning empty results.');
      return [];
    }
    if (!params.query || params.query.trim() === '') {
      return [];
    }

    try {
      const brokerParams = { token: params.token, query: params.query };

      const result = await this.brokerService.submitRequest<SearchResult>(
        this.constructBrokerUrl(params.brokerUrl),
        'youtubeSearchService',
        'searchVideos',
        brokerParams,
      );

      if (result && Array.isArray(result.items)) {
        return result.items.map((item) => ({
          videoId: item.videoId,
          title: item.title,
          description: item.snippet,
          thumbnailUrl: item.thumbnailUrl,
          channelTitle: item.channelTitle,
          publishedAt: item.publishedAt,
        }));
      }

      return [];
    } catch (error) {
      console.error('YouTube search via broker failed:', error);
      return [];
    }
  }
}
