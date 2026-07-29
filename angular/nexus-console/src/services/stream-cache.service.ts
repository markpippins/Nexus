import { Injectable } from '@angular/core';
import { GoogleSearchResult } from '../models/google-search-result.model.js';
import { ImageSearchResult } from '../models/image-search-result.model.js';
import { YoutubeSearchResult } from '../models/youtube-search-result.model.js';
import { AcademicSearchResult } from '../models/academic-search-result.model.js';

type GeminiResult = { query: string; text: string; publishedAt: string };

export type CachedStreamItem =
  | (GoogleSearchResult & { type: 'web' })
  | (ImageSearchResult & { type: 'image' })
  | (YoutubeSearchResult & { type: 'youtube' })
  | (AcademicSearchResult & { type: 'academic' })
  | (GeminiResult & { type: 'gemini' });

interface CacheEntry {
  results: CachedStreamItem[];
  ts: number;
}

/**
 * Client-side cache for magnet-folder search results.
 *
 * <p>Prevents redundant API calls when navigating between magnet folders.
 * Results are keyed by {@code service:query} and expire after a configurable
 * TTL (default 30 min, matching the MongoDB cache on the broker side).
 *
 * <p>Expired entries are cleaned up lazily on read.
 */
@Injectable({ providedIn: 'root' })
export class StreamCacheService {
  private static readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min
  private static readonly MAX_ENTRIES = 200; // prevent unbounded growth

  private store = new Map<string, CacheEntry>();

  // ── Public API ────────────────────────────────────────────────────

  /** Get cached results for a service/query pair. Returns null if miss or expired. */
  get(service: string, query: string): CachedStreamItem[] | null {
    const key = this.makeKey(service, query);
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.ts > StreamCacheService.DEFAULT_TTL_MS) {
      this.store.delete(key);
      return null;
    }

    return entry.results;
  }

  /** Store results for a service/query pair. */
  set(service: string, query: string, results: CachedStreamItem[]): void {
    if (!query || results.length === 0) return;

    const key = this.makeKey(service, query);

    // Prevent unbounded growth — evict oldest entry if at capacity
    if (this.store.size >= StreamCacheService.MAX_ENTRIES && !this.store.has(key)) {
      const oldest = [...this.store.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) this.store.delete(oldest[0]);
    }

    this.store.set(key, { results, ts: Date.now() });
  }

  /** Invalidate a specific service/query entry. Used on force-refresh. */
  invalidate(service: string, query: string): void {
    this.store.delete(this.makeKey(service, query));
  }

  /** Clear the entire cache. */
  invalidateAll(): void {
    this.store.clear();
  }

  /** Total number of cached entries (useful for debugging). */
  get size(): number {
    return this.store.size;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private makeKey(service: string, query: string): string {
    return `${service}:${query}`;
  }
}
