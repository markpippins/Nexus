import { Service, ServiceBroker, Context } from "moleculer";
import axios from "axios";

interface GoogleSearchParams {
  query: string;
  token?: string;
}

interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
}

interface GoogleSearchResponse {
  items: SearchResultItem[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

export default class GoogleSearchService extends Service {
  private apiKey: string;
  private searchEngineId: string;

  constructor(broker: ServiceBroker) {
    super(broker);

    this.parseServiceSchema({
      name: "google-search",
      version: 1,

      settings: {
        apiKey: process.env.GOOGLE_API_KEY || "",
        searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
      },

      actions: {
        simpleSearch: {
          params: {
            query: "string",
            token: { type: "string", optional: true }
          },
          async handler(ctx: Context<GoogleSearchParams>): Promise<GoogleSearchResponse> {
            return this.performSearch(ctx.params.query);
          }
        },

        health: {
          async handler(): Promise<{ status: string; service: string }> {
            return {
              status: "ok",
              service: "google-search"
            };
          }
        }
      },

      started: async () => {
        this.apiKey = this.settings.apiKey;
        this.searchEngineId = this.settings.searchEngineId;

        if (!this.apiKey || !this.searchEngineId) {
          this.logger.warn("Google API credentials not configured. Set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.");
        } else {
          this.logger.info("Google Search Service initialized with API credentials");
        }
      }
    });

    this.apiKey = "";
    this.searchEngineId = "";
  }

  async performSearch(query: string): Promise<GoogleSearchResponse> {
    if (!this.apiKey || !this.searchEngineId) {
      throw new Error("Google API credentials not configured");
    }

    const url = `https://www.googleapis.com/customsearch/v1`;
    
    try {
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          cx: this.searchEngineId,
          q: query
        }
      });

      const items: SearchResultItem[] = response.data.items?.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      })) || [];

      return {
        items,
        searchInformation: response.data.searchInformation
      };
    } catch (error: any) {
      this.logger.error("Google Search API error:", error.message);
      throw new Error(`Failed to perform search: ${error.message}`);
    }
  }
}