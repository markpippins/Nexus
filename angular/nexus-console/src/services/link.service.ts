import { Injectable, signal } from '@angular/core';

export interface LinkItem {
  id: string;
  address: string;
  imagename: string;
  text: string | null;
  type: 'link' | 'separator';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly apiBase = 'http://localhost:3125/api';

  readonly links = signal<LinkItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.fetchLinks();
  }

  async fetchLinks(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${this.apiBase}/links`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.links.set(data);
    } catch (err: any) {
      this.error.set(err.message);
      console.warn('[LinkService] Failed to fetch links:', err.message);
    } finally {
      this.loading.set(false);
    }
  }

  async createLink(address: string, imagename: string, text?: string): Promise<LinkItem> {
    const res = await fetch(`${this.apiBase}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, imagename, text: text || null, type: 'link' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const link = await res.json();
    this.links.update(l => [...l, link]);
    return link;
  }

  async addSeparator(): Promise<LinkItem> {
    const res = await fetch(`${this.apiBase}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '', imagename: '', type: 'separator' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const link = await res.json();
    this.links.update(l => [...l, link]);
    return link;
  }

  async updateLink(id: string, changes: { address?: string; imagename?: string; text?: string | null; type?: 'link' | 'separator'; sortOrder?: number }): Promise<LinkItem> {
    const res = await fetch(`${this.apiBase}/links/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const link = await res.json();
    this.links.update(l => l.map(item => item.id === id ? link : item));
    return link;
  }

  async deleteLink(id: string): Promise<void> {
    const res = await fetch(`${this.apiBase}/links/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    this.links.update(l => l.filter(item => item.id !== id));
  }

  async reorderLinks(items: { id: string; sortOrder: number }[]): Promise<LinkItem[]> {
    const res = await fetch(`${this.apiBase}/links/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const links = await res.json();
    this.links.set(links);
    return links;
  }

  /** Move a link up in the order (swap with the previous non-separator or separator) */
  async moveUp(id: string): Promise<void> {
    const list = this.links();
    const idx = list.findIndex(l => l.id === id);
    if (idx <= 0) return;
    const newOrder = list.map((l, i) => {
      if (i === idx) return { id: l.id, sortOrder: idx - 1 };
      if (i === idx - 1) return { id: l.id, sortOrder: idx };
      return { id: l.id, sortOrder: i };
    });
    await this.reorderLinks(newOrder);
  }

  /** Move a link down in the order (swap with the next item) */
  async moveDown(id: string): Promise<void> {
    const list = this.links();
    const idx = list.findIndex(l => l.id === id);
    if (idx < 0 || idx >= list.length - 1) return;
    const newOrder = list.map((l, i) => {
      if (i === idx) return { id: l.id, sortOrder: idx + 1 };
      if (i === idx + 1) return { id: l.id, sortOrder: idx };
      return { id: l.id, sortOrder: i };
    });
    await this.reorderLinks(newOrder);
  }
}
