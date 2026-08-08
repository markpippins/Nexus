import { Injectable, inject } from '@angular/core';
import { ImageSearchResult } from '../models/image-search-result.model.js';
import { BrokerService } from './broker.service.js';

export interface ImageSearchParams {
  brokerUrl: string;
  token: string;
  query: string;
}

// Response item shape from the Spring broker's unsplashSearchService.searchImages
interface SearchResultItem {
  kind: string;
  title: string;
  description: string;
  regularImageUrl: string;
  smallImageUrl: string;
  thumbImageUrl: string;
  fullImageUrl: string;
  photographerName: string;
  photographerUsername: string;
  photographerPortfolioUrl: string;
  width: number;
  height: number;
  createdAt: string;
  timestamp: string;
}

interface SearchResult {
  items: SearchResultItem[];
}

@Injectable({
  providedIn: 'root',
})
export class UnsplashService {
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

  async search(params: ImageSearchParams, forceRefresh = false): Promise<ImageSearchResult[]> {
    if (!params.brokerUrl) {
      console.warn('UnsplashService: No brokerUrl provided. Returning empty results.');
      return [];
    }
    if (!params.token) {
      console.warn('UnsplashService: No token provided. Returning empty results.');
      return [];
    }
    if (!params.query || params.query.trim() === '') {
      return [];
    }

    try {
      const brokerParams = { token: params.token, query: params.query };

      const result = await this.brokerService.submitRequest<SearchResult>(
        this.constructBrokerUrl(params.brokerUrl),
        'unsplashSearchService',
        forceRefresh ? 'forceSearchImages' : 'searchImages',
        brokerParams,
      );

      if (result && Array.isArray(result.items)) {
        return result.items.map((item) => ({
          id: item.kind,
          url: item.regularImageUrl,
          thumbnailUrl: item.thumbImageUrl,
          description: item.title || item.description,
          photographer: item.photographerName,
          source: 'Unsplash',
          publishedAt: item.createdAt || item.timestamp || new Date().toISOString(),
        }));
      }

      return [];
    } catch (error) {
      console.error('Unsplash image search via broker failed:', error);
      return [];
    }
  }
}
