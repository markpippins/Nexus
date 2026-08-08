import { Component, ChangeDetectionStrategy, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LinkService, LinkItem } from '../../services/link.service.js';

@Component({
  selector: 'app-link-editor-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './link-editor-dialog.component.html',
  styleUrls: ['./link-editor-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'close.emit()',
  },
})
export class LinkEditorDialogComponent {
  private linkService = inject(LinkService);

  close = output<void>();

  links = this.linkService.links;
  loading = this.linkService.loading;

  editing = signal<string | null>(null);
  newLink = signal({ address: '', imagename: '', text: '' });
  newType = signal<'link' | 'separator'>('link');
  editForm = signal({ address: '', imagename: '', text: '', type: 'link' as 'link' | 'separator' });
  saving = signal(false);
  error = signal<string | null>(null);

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.close.emit();
    }
  }

  async onAdd(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.newType() === 'separator') {
        await this.linkService.addSeparator();
      } else {
        const { address, imagename, text } = this.newLink();
        if (!address || !imagename) return;
        await this.linkService.createLink(address, imagename, text || undefined);
      }
      this.newLink.set({ address: '', imagename: '', text: '' });
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(link: LinkItem): void {
    this.editing.set(link.id);
    this.editForm.set({
      address: link.address,
      imagename: link.imagename,
      text: link.text || '',
      type: link.type,
    });
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async onSaveEdit(id: string): Promise<void> {
    const { address, imagename, text, type } = this.editForm();
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.linkService.updateLink(id, {
        address: type === 'separator' ? '' : address,
        imagename: type === 'separator' ? '' : imagename,
        text: text || null,
        type,
      });
      this.editing.set(null);
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  async onDelete(id: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.linkService.deleteLink(id);
      if (this.editing() === id) this.editing.set(null);
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  async onMoveUp(id: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.linkService.moveUp(id);
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  async onMoveDown(id: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.linkService.moveDown(id);
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }

  // ── Template-safe helpers for ngModelChange on signals ──────────
  updateNewType(type: string): void { this.newType.set(type as 'link' | 'separator'); }
  updateNewLinkAddress(address: string): void { this.newLink.update(v => ({...v, address})); }
  updateNewLinkImageName(imagename: string): void { this.newLink.update(v => ({...v, imagename})); }
  updateNewLinkText(text: string): void { this.newLink.update(v => ({...v, text})); }
  updateEditFormType(type: string): void { this.editForm.update(v => ({...v, type: type as 'link' | 'separator'})); }
  updateEditFormAddress(address: string): void { this.editForm.update(v => ({...v, address})); }
  updateEditFormImageName(imagename: string): void { this.editForm.update(v => ({...v, imagename})); }
  updateEditFormText(text: string): void { this.editForm.update(v => ({...v, text})); }
}
