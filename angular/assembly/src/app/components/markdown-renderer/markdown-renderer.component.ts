import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(content: string): string {
  if (!content) return '';

  let html = escapeHtml(content);

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto text-xs my-2"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-primary-700 px-1 py-0.5 rounded text-xs font-mono">$1</code>');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-semibold text-gray-900 mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-sm font-semibold text-gray-900 mt-4 mb-1">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-base font-semibold text-gray-900 mt-4 mb-1">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-gray-700">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-700 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.*$)/gim, '$1• $2');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-2 border-primary-300 pl-3 italic text-gray-600 my-2">$1</blockquote>');

  // Paragraphs - split on blank lines and wrap
  const blocks = html.split(/\n\n+/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<') && (trimmed.startsWith('<pre') || trimmed.startsWith('<h') || trimmed.startsWith('<blockquote'))) {
      return trimmed;
    }
    return `<p class="text-sm text-gray-700 leading-relaxed mb-2">${trimmed.replace(/\n/g, '<br>')}</p>`;
  });

  return blocks.join('\n');
}

@Component({
  selector: 'app-markdown-renderer',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="markdown-content" [innerHTML]="renderedContent"></div>`,
})
export class MarkdownRendererComponent implements OnChanges {
  @Input() content = '';
  renderedContent = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['content']) {
      this.renderedContent = renderMarkdown(this.content);
    }
  }
}
