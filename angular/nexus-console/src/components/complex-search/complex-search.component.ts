import { Component, ChangeDetectionStrategy, signal, viewChild, ElementRef, AfterViewInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from './loading-spinner.component.js';
import { SearchItemComponent } from './search-item.component.js';
import { CustomSearchResult } from '../../models/google-custom-search.model.js';

export interface ComplexSearchParams {
  query: string;
  num: number;
  start: number;
  safe: string;
  languageRestrict: string;
  countryRestrict: string;
  siteSearch: string;
  exactTerms: string;
  excludeTerms: string;
  orTerms: string;
  fileType: string;
  dateRestrict: string;
}

@Component({
  selector: 'app-complex-search',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, SearchItemComponent],
  template: `
    <div class="flex flex-col items-center p-4 sm:p-6 md:p-8 font-sans h-full">
      <main class="w-full max-w-6xl flex-grow flex flex-col">
        <div class="bg-[rgb(var(--color-surface))]/50 p-6 rounded-2xl shadow-2xl border border-[rgb(var(--color-border-base))] backdrop-blur-sm">
          
          <header class="w-full text-center mb-8">
            <h1 class="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2">
              Complex Search
            </h1>
            <p class="text-[rgb(var(--color-text-subtle))] text-lg">
              Build a query using advanced search parameters.
            </p>
          </header>
          
          <div class="flex flex-col sm:flex-row gap-3 mb-6">
            <input 
              #searchInput 
              type="text" 
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              (keyup.enter)="performSearch()"
              placeholder="Enter your search query"
              class="flex-grow bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-3 text-lg text-[rgb(var(--color-text-base))] focus:ring-2 focus:ring-[rgb(var(--color-accent-ring))] focus:outline-none transition duration-300 placeholder:text-[rgb(var(--color-text-subtle))]"
            />
            <button 
              (click)="performSearch()" 
              [disabled]="loading()"
              class="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
            >
              @if (loading()) {
                <span class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                <span>Searching...</span>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" /></svg>
                <span>Search</span>
              }
            </button>
          </div>
          
          <details open>
            <summary class="text-xl font-semibold text-[rgb(var(--color-text-base))] cursor-pointer hover:text-[rgb(var(--color-accent-text))]">Search Parameters</summary>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 mt-4">
              
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Number of Results <code class="text-xs text-cyan-400">num</code></label>
                <input type="number" min="1" max="10" [value]="num()" (input)="num.set(+$any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Start Index <code class="text-xs text-cyan-400">start</code></label>
                <input type="number" min="1" [value]="start()" (input)="start.set(+$any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Safe Search <code class="text-xs text-cyan-400">safe</code></label>
                <select (change)="safe.set($any($event.target).value)" [value]="safe()" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]">
                  <option value="active">Active</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Language Restrict <code class="text-xs text-cyan-400">lr</code></label>
                <select (change)="languageRestrict.set($any($event.target).value)" [value]="languageRestrict()" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]">
                  @for(lang of languages; track lang.code) {
                    <option [value]="lang.code">{{ lang.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Country Restrict <code class="text-xs text-cyan-400">cr</code></label>
                <input type="text" [value]="countryRestrict()" (input)="countryRestrict.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., countryUS">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Site Search <code class="text-xs text-cyan-400">siteSearch</code></label>
                <input type="text" [value]="siteSearch()" (input)="siteSearch.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., developers.google.com">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Exact Terms <code class="text-xs text-cyan-400">exactTerms</code></label>
                <input type="text" [value]="exactTerms()" (input)="exactTerms.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., \`Angular signals\`">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Exclude Terms <code class="text-xs text-cyan-400">excludeTerms</code></label>
                <input type="text" [value]="excludeTerms()" (input)="excludeTerms.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., AngularJS">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">OR Terms <code class="text-xs text-cyan-400">orTerms</code></label>
                <input type="text" [value]="orTerms()" (input)="orTerms.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., tutorial guide">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">File Type <code class="text-xs text-cyan-400">fileType</code></label>
                <input type="text" [value]="fileType()" (input)="fileType.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., pdf">
              </div>
              <div>
                <label class="block text-sm font-medium text-[rgb(var(--color-text-muted))]">Date Restrict <code class="text-xs text-cyan-400">dateRestrict</code></label>
                <input type="text" [value]="dateRestrict()" (input)="dateRestrict.set($any($event.target).value)" class="w-full mt-1 bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded-lg p-2 text-[rgb(var(--color-text-base))]" placeholder="e.g., d[7], m[3], y[1]">
              </div>
            </div>
          </details>
        </div>

        <div class="mt-8 flex-grow">
          @if (loading()) {
            <div class="flex justify-center items-center h-64">
              <app-loading-spinner></app-loading-spinner>
            </div>
          } @else if (error(); as errorMessage) {
            <div class="bg-[rgb(var(--color-danger-bg-hover))] border border-red-700 text-[rgb(var(--color-danger-text))] p-4 rounded-lg text-center">
              <p class="font-bold">An Error Occurred</p>
              <p>{{ errorMessage }}</p>
            </div>
          } @else if (searchResult(); as result) {
            <div class="animate-fade-in">
              @if(result.searchInformation; as info) {
                <p class="text-[rgb(var(--color-text-subtle))] mb-4">About {{ info.formattedTotalResults }} results ({{ info.formattedSearchTime }} seconds)</p>
              }
              <div class="space-y-6">
                @if(result.items; as items) {
                  @for(item of items; track item.cacheId) {
                    <app-search-item [item]="item"></app-search-item>
                  }
                }
              </div>

              <!-- Pagination -->
              @if(result.queries; as queries) {
                <div class="flex justify-between items-center mt-8">
                  @if(queries.previousPage?.[0]; as prevPage) {
                    <button (click)="goToPage(prevPage.startIndex)" class="flex items-center gap-2 bg-[rgb(var(--color-surface-hover))] hover:bg-[rgb(var(--color-border-base))] text-[rgb(var(--color-text-base))] font-semibold px-4 py-2 rounded-lg transition-colors">
                      Previous
                    </button>
                  } @else {
                    <div></div> <!-- Spacer -->
                  }
                  @if(queries.nextPage?.[0]; as nextPage) {
                    <button (click)="goToPage(nextPage.startIndex)" class="flex items-center gap-2 bg-[rgb(var(--color-surface-hover))] hover:bg-[rgb(var(--color-border-base))] text-[rgb(var(--color-text-base))] font-semibold px-4 py-2 rounded-lg transition-colors">
                      Next
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="text-center text-[rgb(var(--color-text-subtle))] p-8 bg-[rgb(var(--color-surface))]/30 rounded-lg border border-dashed border-[rgb(var(--color-border-base))]">
              <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <p class="mt-4 text-xl">Your search results will appear here.</p>
              <p>Fill in the parameters and start searching.</p>
            </div>
          }
        </div>

      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComplexSearchComponent implements AfterViewInit {
  search = output<ComplexSearchParams>();

  // Main query
  query = signal('Angular Signals');

  // Parameters
  num = signal(10);
  start = signal(1);
  safe = signal('active');
  languageRestrict = signal('');
  countryRestrict = signal('');
  siteSearch = signal('');
  exactTerms = signal('');
  excludeTerms = signal('');
  orTerms = signal('');
  fileType = signal('');
  dateRestrict = signal('');
  
  // State for results
  loading = signal(false);
  error = signal<string | null>(null);
  searchResult = signal<CustomSearchResult | null>(null);

  searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  languages = [
      { code: '', name: 'Any Language' },
      { code: 'lang_ar', name: 'Arabic' },
      { code: 'lang_zh-CN', name: 'Chinese (Simplified)' },
      { code: 'lang_zh-TW', name: 'Chinese (Traditional)' },
      { code: 'lang_cs', name: 'Czech' },
      { code: 'lang_da', name: 'Danish' },
      { code: 'lang_nl', name: 'Dutch' },
      { code: 'lang_en', name: 'English' },
      { code: 'lang_fi', name: 'Finnish' },
      { code: 'lang_fr', name: 'French' },
      { code: 'lang_de', name: 'German' },
      { code: 'lang_el', name: 'Greek' },
      { code: 'lang_he', name: 'Hebrew' },
      { code: 'lang_hu', name: 'Hungarian' },
      { code: 'lang_id', name: 'Indonesian' },
      { code: 'lang_it', name: 'Italian' },
      { code: 'lang_ja', name: 'Japanese' },
      { code: 'lang_ko', name: 'Korean' },
      { code: 'lang_no', name: 'Norwegian' },
      { code: 'lang_pl', name: 'Polish' },
      { code: 'lang_pt', name: 'Portuguese' },
      { code: 'lang_ru', name: 'Russian' },
      { code: 'lang_es', name: 'Spanish' },
      { code: 'lang_sv', name: 'Swedish' },
      { code: 'lang_tr', name: 'Turkish' },
    ];

  ngAfterViewInit(): void {
    setTimeout(() => {
        this.searchInput().nativeElement.focus();
        this.searchInput().nativeElement.select();
    }, 100);
  }

  performSearch(): void {
    this.search.emit({
      query: this.query(),
      num: this.num(),
      start: this.start(),
      safe: this.safe(),
      languageRestrict: this.languageRestrict(),
      countryRestrict: this.countryRestrict(),
      siteSearch: this.siteSearch(),
      exactTerms: this.exactTerms(),
      excludeTerms: this.excludeTerms(),
      orTerms: this.orTerms(),
      fileType: this.fileType(),
      dateRestrict: this.dateRestrict(),
    });
  }
  
  goToPage(startIndex: number): void {
    this.start.set(startIndex);
    this.performSearch();
  }
}
