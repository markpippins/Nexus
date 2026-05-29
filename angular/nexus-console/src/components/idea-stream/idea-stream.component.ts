import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiPreferencesService } from '../../services/ui-preferences.service.js';
import { LocalConfigService } from '../../services/local-config.service.js';
import { BookmarkService } from '../../services/bookmark.service.js';
import { ToastService } from '../../services/toast.service.js';
import { GoogleSearchService, GoogleSearchParams } from '../../services/google-search.service.js';
import { UnsplashService } from '../../services/unsplash.service.js';
import { GeminiService } from '../../services/gemini.service.js';
import { YoutubeSearchService } from '../../services/youtube-search.service.js';
import { AcademicSearchService } from '../../services/academic-search.service.js';
import { GoogleSearchResult } from '../../models/google-search-result.model.js';
import { ImageSearchResult } from '../../models/image-search-result.model.js';
import { YoutubeSearchResult } from '../../models/youtube-search-result.model.js';
import { AcademicSearchResult } from '../../models/academic-search-result.model.js';
import { FileSystemProvider } from '../../services/file-system-provider.js';
import { NewBookmark } from '../../models/bookmark.model.js';
import { WebResultCardComponent } from '../stream-cards/web-result-card.component.js';
import { ImageResultCardComponent } from '../stream-cards/image-result-card.component.js';
import { GeminiResultCardComponent } from '../stream-cards/gemini-result-card.component.js';
import { YoutubeResultCardComponent } from '../stream-cards/youtube-result-card.component.js';
import { AcademicResultCardComponent } from '../stream-cards/academic-result-card.component.js';
import { WebResultListItemComponent } from '../stream-list-items/web-result-list-item.component.js';
import { ImageResultListItemComponent } from '../stream-list-items/image-result-list-item.component.js';
import { GeminiResultListItemComponent } from '../stream-list-items/gemini-result-list-item.component.js';
import { YoutubeResultListItemComponent } from '../stream-list-items/youtube-result-list-item.component.js';
import { AcademicResultListItemComponent } from '../stream-list-items/academic-result-list-item.component.js';

type GeminiResult = { query: string; text: string; publishedAt: string };

type StreamItem =
  | (GoogleSearchResult & { type: 'web' })
  | (ImageSearchResult & { type: 'image' })
  | (YoutubeSearchResult & { type: 'youtube' })
  | (AcademicSearchResult & { type: 'academic' })
  | (GeminiResult & { type: 'gemini' });

type StreamItemType = 'web' | 'image' | 'youtube' | 'academic' | 'gemini';
type StreamSortKey = 'relevance' | 'title' | 'source' | 'date';
interface StreamSortCriteria {
  key: StreamSortKey;
  direction: 'asc' | 'desc';
}

interface PaneContext {
  path: string[];
  profile: { brokerUrl: string; name: string } | undefined;
  token: string | null;
}

@Component({
  selector: 'app-idea-stream',
  standalone: true,
  imports: [
    CommonModule,
    WebResultCardComponent,
    ImageResultCardComponent,
    GeminiResultCardComponent,
    YoutubeResultCardComponent,
    AcademicResultCardComponent,
    WebResultListItemComponent,
    ImageResultListItemComponent,
    GeminiResultListItemComponent,
    YoutubeResultListItemComponent,
    AcademicResultListItemComponent,
  ],
  templateUrl: './idea-stream.component.html',
  host: { style: 'display: block;' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeaStreamComponent {
  private uiPreferencesService = inject(UiPreferencesService);
  private localConfigService = inject(LocalConfigService);
  private bookmarkService = inject(BookmarkService);
  private toastService = inject(ToastService);
  private googleSearchService = inject(GoogleSearchService);
  private unsplashService = inject(UnsplashService);
  private geminiService = inject(GeminiService);
  private youtubeSearchService = inject(YoutubeSearchService);
  private academicSearchService = inject(AcademicSearchService);

  // --- Inputs from parent ---
  isCollapsed = input.required<boolean>();
  streamPaneHeight = input.required<number>();
  activePaneId = input.required<number>();
  isSplitView = input.required<boolean>();
  pane1Context = input.required<PaneContext>();
  pane2Context = input.required<PaneContext>();
  getProvider = input.required<(path: string[]) => FileSystemProvider>();
  isActionableContext = input.required<boolean>();

  // --- Outputs ---
  startResize = output<MouseEvent>();
  collapseToggled = output<void>();
  activeSearchToggled = output<void>();
  complexSearchRequested = output<void>();
  geminiSearchRequested = output<void>();

  // --- Injected state ---
  isStreamPaneCollapsed = this.uiPreferencesService.isStreamPaneCollapsed;
  isStreamActiveSearchEnabled = this.uiPreferencesService.isStreamActiveSearchEnabled;
  bookmarkedLinks = this.bookmarkService.bookmarkedLinks;

  streamResultsForPane1 = signal<StreamItem[]>([]);
  streamResultsForPane2 = signal<StreamItem[]>([]);
  streamDisplayMode = signal<'grid' | 'list'>('grid');
  streamSourceToggle = signal<'all' | 'active' | 'left' | 'right'>('active');
  streamSearchQuery = signal('');

  readonly streamFilterTypes: { type: StreamItemType; label: string; iconPath: string }[] = [
    { type: 'web', label: 'Web', iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zM4.75 5.177a3.502 3.502 0 014.22.613l.31.39a.75.75 0 001.442 0l.31-.39a3.502 3.502 0 014.22-.613A4.502 4.502 0 0119 8.5v.081a4.5 4.5 0 01-5.138 4.417l-.27-1.353a.75.75 0 00-1.44-.288l-1.045 1.62a.75.75 0 00.288 1.441l1.354.27a4.5 4.5 0 01-4.416 5.137H8.5a4.502 4.502 0 01-3.323-1.413 3.502 3.502 0 01-.613-4.22l.39-.31a.75.75 0 000-1.442l-.39-.31a3.502 3.502 0 01-.613-4.22A4.502 4.502 0 014.75 5.177z' },
    { type: 'image', label: 'Images', iconPath: 'M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10zM6 8a1 1 0 100-2 1 1 0 000 2zm2 4l-2 3h8l-3-4-2 2.5L8 12z' },
    { type: 'youtube', label: 'Videos', iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z' },
    { type: 'academic', label: 'Academic', iconPath: 'M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 16c1.255 0 2.443-.29 3.5-.804V4.804zM14.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 0114.5 16c1.255 0 2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4z' },
    { type: 'gemini', label: 'AI', iconPath: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z' }
  ];
  activeStreamFilters = signal<Set<StreamItemType>>(new Set(this.streamFilterTypes.map(f => f.type)));

  isStreamSortDropdownOpen = signal(false);
  streamSortCriteria = signal<StreamSortCriteria>({ key: 'relevance', direction: 'asc' });

  // Filtered and sorted stream results for rendering
  visibleStreamResults = computed(() => {
    const source = this.streamSourceToggle();
    let combinedResults: StreamItem[] = [];

    if (source === 'all') {
      combinedResults = [...this.streamResultsForPane1(), ...this.streamResultsForPane2()];
    } else if (source === 'left') {
      combinedResults = this.streamResultsForPane1();
    } else if (source === 'right') {
      combinedResults = this.streamResultsForPane2();
    } else {
      combinedResults = this.activePaneId() === 1 ? this.streamResultsForPane1() : this.streamResultsForPane2();
    }
    return combinedResults;
  });

  processedStreamResults = computed(() => {
    let items = this.visibleStreamResults();
    const query = this.streamSearchQuery().toLowerCase();
    const filters = this.activeStreamFilters();
    const sort = this.streamSortCriteria();

    if (query) {
      items = items.filter(item => {
        if ('title' in item && item.title.toLowerCase().includes(query)) return true;
        if ('snippet' in item && item.snippet?.toLowerCase().includes(query)) return true;
        if ('description' in item && item.description?.toLowerCase().includes(query)) return true;
        if ('text' in item && item.text.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    items = items.filter(item => filters.has(item.type));

    items.sort((a, b) => {
      if (sort.key === 'relevance') {
        return 0;
      }

      let valA = '';
      let valB = '';

      const getSource = (item: StreamItem): string => {
        switch (item.type) {
          case 'web': return item.source || '';
          case 'image': return item.source || '';
          case 'youtube': return item.channelTitle || '';
          case 'academic': return item.publication || '';
          case 'gemini': return 'Gemini';
        }
      };

      switch (sort.key) {
        case 'title':
          valA = ('title' in a ? (a as any).title : ('description' in a ? (a as any).description : (a as any).query)) ?? '';
          valB = ('title' in b ? (b as any).title : ('description' in b ? (b as any).description : (b as any).query)) ?? '';
          break;
        case 'source':
          valA = getSource(a);
          valB = getSource(b);
          break;
        case 'date':
          valA = a.publishedAt || '';
          valB = b.publishedAt || '';
          break;
      }

      const compareVal = valA.localeCompare(valB);
      return sort.direction === 'asc' ? compareVal : -compareVal;
    });

    return items;
  });

  isStreamToolbarVisible = computed(() => {
    const activeId = this.activePaneId();
    const ctx = activeId === 1 ? this.pane1Context() : this.pane2Context();
    const path = ctx.path;
    if (path.length === 0) return false;
    const root = path[0];
    const sessionName = this.localConfigService.sessionName();
    return root === sessionName || root === 'File Systems';
  });

  private loadStreamResultsForPanes = effect(async () => {
    const contexts: ({ id: number } & PaneContext)[] = [];

    if (this.isSplitView()) {
      contexts.push({ id: 1, ...this.pane1Context() });
      contexts.push({ id: 2, ...this.pane2Context() });
    } else {
      const activeId = this.activePaneId();
      contexts.push({ id: activeId, ...(activeId === 1 ? this.pane1Context() : this.pane2Context()) });
    }

    for (const context of contexts) {
      const { id, path, profile, token } = context;

      let isMagnetFolder = false;
      if (path.length > 0) {
        const provider = this.getProvider()(path);
        const providerPath = path.slice(1);
        isMagnetFolder = await provider.hasFile(providerPath, '.magnet');
      }

      if (!isMagnetFolder || !this.isStreamActiveSearchEnabled()) {
        if (id === 1) {
          this.streamResultsForPane1.set([]);
        } else {
          this.streamResultsForPane2.set([]);
        }
        continue;
      }

      const rootName = path[0];
      const relativePath = path.slice(1);

      const query = relativePath.length > 0 ? relativePath[relativePath.length - 1] : rootName;
      const simpleSearchQuery = relativePath.join(', ');

      const promises: Promise<StreamItem[]>[] = [];

      if (profile && token) {
        const safeBrokerUrl = profile.brokerUrl || '';
        const searchParams: GoogleSearchParams = {
          brokerUrl: safeBrokerUrl,
          token: token,
          query: simpleSearchQuery
        };
        promises.push(
          this.googleSearchService.search(searchParams)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'web' as const, paneId: id })))
        );

        promises.push(
          this.geminiService.search(query)
            .then(text => [{ query, text, publishedAt: new Date().toISOString(), type: 'gemini' as const, paneId: id }])
        );
      } else {
        promises.push(
          this.unsplashService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'image' as const, paneId: id })))
        );

        promises.push(
          this.youtubeSearchService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'youtube' as const, paneId: id })))
        );

        promises.push(
          this.academicSearchService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'academic' as const, paneId: id })))
        );

        promises.push(
          this.geminiService.search(query)
            .then(text => [{ query, text, publishedAt: new Date().toISOString(), type: 'gemini' as const, paneId: id }])
        );
      }

      try {
        const results = await Promise.all(promises);
        const flattenedResults = results.flat();

        if (id === 1) {
          this.streamResultsForPane1.set(flattenedResults);
        } else {
          this.streamResultsForPane2.set(flattenedResults);
        }
      } catch (error) {
        console.error(`Failed to load stream results for pane ${id}`, error);
        if (id === 1) {
          this.streamResultsForPane1.set([]);
        } else {
          this.streamResultsForPane2.set([]);
        }
      }
    }
  }, { allowSignalWrites: true });

  onStreamSearchChange(event: Event): void {
    this.streamSearchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleStreamFilter(type: StreamItemType): void {
    this.activeStreamFilters.update(current => {
      const newSet = new Set(current);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }

  toggleAllStreamFilters(): void {
    if (this.activeStreamFilters().size === this.streamFilterTypes.length) {
      this.activeStreamFilters.set(new Set());
    } else {
      this.activeStreamFilters.set(new Set(this.streamFilterTypes.map(f => f.type)));
    }
  }

  toggleStreamSortDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isStreamSortDropdownOpen.update(v => !v);
  }

  onStreamSortChange(key: StreamSortKey): void {
    this.streamSortCriteria.set({ key, direction: 'asc' });
    this.isStreamSortDropdownOpen.set(false);
  }

  getStreamItemLink(item: StreamItem): string {
    switch (item.type) {
      case 'web':
      case 'academic':
        return item.link;
      case 'image':
        return item.url;
      case 'youtube':
        return `https://www.youtube.com/watch?v=${item.videoId}`;
      case 'gemini':
        return `gemini:${item.query}:${item.publishedAt}`;
    }
  }

  onBookmarkToggled(item: StreamItem): void {
    const link = this.getStreamItemLink(item);
    const existing = this.bookmarkService.findBookmarkByLink(link);

    if (existing) {
      this.bookmarkService.deleteBookmark(existing._id);
      this.toastService.show('Bookmark removed.');
    } else {
      let newBookmark: NewBookmark;
      switch (item.type) {
        case 'web':
          newBookmark = { type: 'web', title: item.title, link: item.link, snippet: item.snippet, source: item.source };
          break;
        case 'image':
          newBookmark = { type: 'image', title: item.description, link: item.url, thumbnailUrl: item.thumbnailUrl, snippet: `by ${item.photographer}`, source: item.source };
          break;
        case 'youtube':
          newBookmark = { type: 'youtube', title: item.title, link: `https://www.youtube.com/watch?v=${item.videoId}`, thumbnailUrl: item.thumbnailUrl, snippet: item.description, source: item.channelTitle };
          break;
        case 'academic':
          newBookmark = { type: 'academic', title: item.title, link: item.link, snippet: item.snippet, source: item.publication };
          break;
        case 'gemini':
          newBookmark = { type: 'gemini', title: `Gemini: ${item.query}`, link: this.getStreamItemLink(item), snippet: item.text, source: 'Gemini' };
          break;
      }
      const activeCtx = this.activePaneId() === 1 ? this.pane1Context() : this.pane2Context();
      this.bookmarkService.addBookmark(activeCtx.path, newBookmark);
      this.toastService.show('Bookmark saved to current folder.');
    }
  }
}
