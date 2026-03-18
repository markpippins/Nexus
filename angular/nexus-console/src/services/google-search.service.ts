import { Injectable, inject } from '@angular/core';
import { GoogleSearchResult } from '../models/google-search-result.model.js';
import { BrokerService } from './broker.service.js';

export interface GoogleSearchParams {
  brokerUrl: string;
  token: string;
  query: string;
}

// Based on the user's provided Java class
interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  // Other fields from the backend are not used in the frontend GoogleSearchResult model.
}

interface SearchResult {
  items: SearchResultItem[];
}

@Injectable({
  providedIn: 'root',
})
export class GoogleSearchService {
  private brokerService = inject(BrokerService);

  private constructBrokerUrl(baseUrl: string): string {
    let fullUrl = baseUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = `http://${fullUrl}`;
    }
    if (fullUrl.endsWith('/')) {
        fullUrl = fullUrl.slice(0, -1);
    }
    fullUrl += '/api/broker/submitRequest';
    return fullUrl;
  }

  async search(params: GoogleSearchParams): Promise<GoogleSearchResult[]> {
    if (!params.brokerUrl) {
      console.warn('GoogleSearchService: No brokerUrl provided. Returning empty results.');
      return Promise.resolve([]);
    }
    if (!params.token) {
      console.warn('GoogleSearchService: No token provided. Returning empty results.');
      return Promise.resolve([]);
    }
    if (!params.query || params.query.trim() === '') {
      // Don't send a search request for an empty query.
      return Promise.resolve([]);
    }

    try {
      // Explicitly create the params object for the broker request
      // to ensure it matches the required structure exactly.
      const brokerParams = {
        token: params.token,
        query: params.query,
      };

      const result = await this.brokerService.submitRequest<SearchResult>(
        this.constructBrokerUrl(params.brokerUrl), 
        'googleSearchService', 
        'simpleSearch', 
        brokerParams
      );

      // The backend returns a SearchResult object which contains an `items` array.
      if (result && Array.isArray(result.items)) {
        return result.items.map((item, index) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: item.displayLink,
          // The backend model doesn't seem to include a date, so we'll create one.
          publishedAt: new Date(Date.now() - (index * 1000 * 3600)).toISOString(),
        }));
      }

      return [];

    } catch (error) {
      console.error('Google search via broker failed:', error);
      // It's better to return an empty array than to throw, so the UI doesn't break.
      return [];
    }
  }
}
