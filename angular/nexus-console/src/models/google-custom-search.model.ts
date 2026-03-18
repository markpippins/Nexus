export interface SearchItem {
  kind: string;
  title: string;
  htmlTitle: string;
  link: string;
  displayLink: string;
  snippet: string;
  htmlSnippet: string;
  cacheId?: string;
  formattedUrl: string;
  htmlFormattedUrl: string;
  pagemap?: {
    cse_thumbnail?: { src: string }[];
    metatags?: { [key: string]: string }[];
    [key: string]: any;
  };
}

export interface SearchInformation {
  searchTime: number;
  formattedSearchTime: string;
  totalResults: string;
  formattedTotalResults: string;
}

export interface SearchQueryInfo {
  title: string;
  totalResults: string;
  searchTerms: string;
  count: number;
  startIndex: number;
  inputEncoding: string;
  outputEncoding: string;
  safe: string;
  cx: string;
}

export interface CustomSearchResult {
  kind: string;
  searchInformation?: SearchInformation;
  items?: SearchItem[];
  queries?: {
    request?: SearchQueryInfo[];
    nextPage?: SearchQueryInfo[];
    previousPage?: SearchQueryInfo[];
  };
  context?: {
    title: string;
  };
}
