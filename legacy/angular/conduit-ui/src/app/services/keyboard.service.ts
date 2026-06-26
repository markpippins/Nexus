import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

export interface ShortcutHandler {
  key: string;
  description: string;
  handler: () => void;
  /** If true, event.preventDefault() is called */
  preventDefault?: boolean;
}

/**
 * Centralized keyboard shortcut service.
 *
 * Components register their shortcuts on init and unregister on destroy.
 * The AppComponent drives the global keydown listener and delegates to
 * whichever view is currently focused via this service.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService implements OnDestroy {
  /** Global shortcuts that are always active (view nav, theme, help) */
  private globalHandlers = new Map<string, ShortcutHandler>();

  /** View-scoped shortcuts registered by the currently active component */
  private viewHandlers = new Map<string, ShortcutHandler>();

  /** Stack of registered view IDs so we can scope shortcuts */
  private activeViewId: string | null = null;

  /** The bound keydown listener so we can clean up */
  private boundListener: ((e: KeyboardEvent) => void) | null = null;

  /** Whether the help overlay is currently shown */
  private _helpVisible = false;
  get helpVisible(): boolean { return this._helpVisible; }

  private _helpToggleHandlers: Array<() => void> = [];

  constructor(private router: Router) {}

  // ---------------------------------------------------------------------------
  // Global shortcuts (always active)
  // ---------------------------------------------------------------------------

  registerGlobal(handler: ShortcutHandler): void {
    this.globalHandlers.set(handler.key, handler);
  }

  unregisterGlobal(key: string): void {
    this.globalHandlers.delete(key);
  }

  // ---------------------------------------------------------------------------
  // View-scoped shortcuts
  // ---------------------------------------------------------------------------

  /**
   * Register shortcuts for a view.  The viewId should be a unique string
   * (e.g. the component name).  Call this in ngOnInit / ngAfterViewInit.
   * When a new view registers, its shortcuts replace the previous view's.
   */
  registerView(viewId: string, handlers: ShortcutHandler[]): void {
    this.activeViewId = viewId;
    this.viewHandlers.clear();
    for (const h of handlers) {
      this.viewHandlers.set(h.key, h);
    }
  }

  /** Call in ngOnDestroy to clear view shortcuts. */
  unregisterView(viewId: string): void {
    if (this.activeViewId === viewId) {
      this.viewHandlers.clear();
      this.activeViewId = null;
    }
  }

  /** Return all currently active shortcuts (for the help overlay). */
  getActiveShortcuts(): { global: ShortcutHandler[]; view: ShortcutHandler[] } {
    return {
      global: Array.from(this.globalHandlers.values()),
      view: Array.from(this.viewHandlers.values()),
    };
  }

  // ---------------------------------------------------------------------------
  // Help overlay toggle
  // ---------------------------------------------------------------------------

  onHelpToggle(fn: () => void): void {
    this._helpToggleHandlers.push(fn);
  }

  toggleHelp(): void {
    this._helpVisible = !this._helpVisible;
    for (const fn of this._helpToggleHandlers) {
      fn();
    }
  }

  // ---------------------------------------------------------------------------
  // Global keydown listener (attached by AppComponent)
  // ---------------------------------------------------------------------------

  attach(document: Document): void {
    if (this.boundListener) return;
    this.boundListener = (e: KeyboardEvent) => this.handleKeydown(e);
    document.addEventListener('keydown', this.boundListener);
  }

  detach(document: Document): void {
    if (this.boundListener) {
      document.removeEventListener('keydown', this.boundListener);
      this.boundListener = null;
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ignore if user is typing in an input / textarea / contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Still allow Escape and ? in inputs
      if (e.key !== 'Escape' && e.key !== '?') return;
    }

    const key = e.key;

    // 1) Check view-scoped handlers first (more specific)
    const viewHandler = this.viewHandlers.get(key);
    if (viewHandler) {
      if (viewHandler.preventDefault) e.preventDefault();
      viewHandler.handler();
      return;
    }

    // 2) Fall through to global handlers
    const globalHandler = this.globalHandlers.get(key);
    if (globalHandler) {
      if (globalHandler.preventDefault) e.preventDefault();
      globalHandler.handler();
      return;
    }
  }

  ngOnDestroy(): void {
    this.globalHandlers.clear();
    this.viewHandlers.clear();
    this._helpToggleHandlers = [];
  }
}
