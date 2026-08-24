/**
 * Search Service Models
 *
 * Aggregated search result models (Google/YouTube/Unsplash/Gemini) plus the
 * cache entry. Maps to JVM package com.aibizarchitect.nexus.v1.spring.search.
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.search {

  /** A single search result item (provider-agnostic union of fields). */
  model SearchResultItem {
    kind?: string;
    title?: string;
    htmlTitle?: string;
    link?: string;
    displayLink?: string;
    snippet?: string;
    htmlSnippet?: string;
    formattedUrl?: string;
    htmlFormattedUrl?: string;
    pagemap?: Record<unknown>;
    metatags?: Record<string>[];
    cseThumbnail?: Record<string>[];
    cseImage?: Record<string>[];
    timestamp?: utcDateTime;
    videoId?: string;
    channelTitle?: string;
    publishDate?: string;
    thumbnailUrl?: string;
    mediumThumbnailUrl?: string;
    highThumbnailUrl?: string;
    duration?: string;
    viewCount?: int32;
    channelId?: string;
    publishedAt?: string;
    channelUrl?: string;
    regularImageUrl?: string;
    smallImageUrl?: string;
    thumbImageUrl?: string;
    fullImageUrl?: string;
    photographerName?: string;
    photographerUsername?: string;
    photographerPortfolioUrl?: string;
    downloadCount?: int32;
    width?: int32;
    height?: int32;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    description?: string;
    prompt?: string;
    generatedText?: string;
    promptFeedback?: Record<unknown>[];
    safetyRating?: float64;
    modelUsed?: string;
    generationConfig?: string;
    maxOutputTokens?: int32;
    temperature?: float64;
    mimeType?: string;
  }

  /** A search result (items + raw provider response). */
  model SearchResult {
    items?: SearchResultItem[];
    rawResponse?: unknown;
  }

  /** A cached search result. */
  model SearchResultsCacheEntry {
    id?: string;
    query?: string;
    items?: SearchResultItem[];
    timestamp?: utcDateTime;
    expiresAt?: utcDateTime;
  }
}
