import { Component, ChangeDetectionStrategy, signal, computed, ViewChild, ElementRef, inject, input, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TextEditorService } from '../../services/note-dialog.service.js';
import { NotesService } from '../../services/notes.service.js';
import { ToastService } from '../../services/toast.service.js';

// Declare the globals from the CDN scripts
declare var marked: { parse(markdown: string): string; };
declare var DOMPurify: { sanitize(dirty: string): string; };

const DEFAULT_NOTE_TEXT = '# Notes\n\n- Select a folder to view or create a note.\n- Notes are saved automatically as you type.';

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesComponent implements OnDestroy {
  private textEditorService = inject(TextEditorService);
  private notesService = inject(NotesService);
  private toastService = inject(ToastService);

  path = input.required<string[]>();
  
  noteContent = signal<string>(DEFAULT_NOTE_TEXT);
  mode = signal<'edit' | 'preview'>('edit');
  isLoading = signal(false);
  private saveTimeout: any;

  @ViewChild('editor') editorTextarea: ElementRef<HTMLTextAreaElement> | undefined;

  isNoteAvailable = computed(() => this.notesService.isConnected(this.path()));

  renderedHtml = computed(() => {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        const rawHtml = marked.parse(this.noteContent());
        return DOMPurify.sanitize(rawHtml);
    }
    // Provide a graceful fallback if the libraries fail to load
    return '<p>Error: Markdown parsing libraries not loaded.</p>';
  });

  constructor() {
    effect(() => {
      // When path changes, load the note for the new path.
      this.path();
      if (this.isNoteAvailable()) {
        this.loadNote();
      } else {
        this.isLoading.set(false);
        this.noteContent.set('# Disconnected\n\nConnect to the server to view or edit notes for this folder.');
      }
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    clearTimeout(this.saveTimeout);
  }

  private async loadNote(): Promise<void> {
    this.isLoading.set(true);
    try {
      const note = await this.notesService.getNote(this.path());
      const folderName = this.path().length > 0 ? this.path()[this.path().length - 1] : 'Nexus';
      this.noteContent.set(note?.content ?? `# Notes for ${folderName}\n\nThis note is empty. Start typing...`);
    } catch(e) {
      console.error('Failed to load note:', e);
      this.noteContent.set(`# Error\n\nCould not load note for this folder.`);
    } finally {
      this.isLoading.set(false);
    }
  }

  private scheduleSave(content: string): void {
    clearTimeout(this.saveTimeout);

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.notesService.saveNote(this.path(), content);
      } catch (e) {
        console.error('Failed to save note:', e);
        this.toastService.show((e as Error).message, 'error');
      }
    }, 500); // Debounce saves by 500ms
  }

  onInput(event: Event): void {
    const newContent = (event.target as HTMLTextAreaElement).value;
    this.noteContent.set(newContent);
    if (this.isNoteAvailable()) {
      this.scheduleSave(newContent);
    }
  }

  openInDialog(): void {
    const path = this.path();
    const title = path.length > 0 ? `Note for ${path[path.length - 1]}` : 'Note';
    this.textEditorService.open(this.noteContent, title, 'note.md');
  }

  applyMarkdown(prefix: string, suffix: string = prefix, placeholder: string = 'text'): void {
    if (!this.isNoteAvailable()) return;
    const textarea = this.editorTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end);

    let replacement = '';
    let selectionStartOffset = prefix.length;
    let selectionEndOffset = prefix.length;

    if (selectedText) {
      replacement = prefix + selectedText + suffix;
      selectionEndOffset += selectedText.length;
    } else {
      replacement = prefix + placeholder + suffix;
      selectionEndOffset += placeholder.length;
    }

    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    this.noteContent.set(newText);
    this.scheduleSave(newText);
    
    // After render, focus and select the text
    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + selectionStartOffset, start + selectionEndOffset);
    }, 0);
  }

  addLink(): void {
    if (!this.isNoteAvailable()) return;
    const url = prompt('Enter URL:');
    if (url) {
      this.applyMarkdown('[', `](${url})`, 'link text');
    }
  }

  applyCode(): void {
    if (!this.isNoteAvailable()) return;
    const textarea = this.editorTextarea?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    if (selectedText.includes('\n')) {
      // Block code
      this.applyMarkdown('```\n', '\n```', 'code');
    } else {
      // Inline code
      this.applyMarkdown('`', '`', 'code');
    }
  }
}