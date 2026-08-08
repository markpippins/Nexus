import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';

export interface TtsSynthesizeResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

@Injectable({ providedIn: 'root' })
export class TtsService {
  private base = '/tts';

  constructor(private http: HttpClient) {}

  /**
   * Send text to the TTS server for server-side audio playback via Piper TTS.
   * The audio plays on the server's speakers — no browser audio needed.
   */
  speak(text: string): Observable<TtsSynthesizeResponse> {
    // Strip markdown syntax to produce clean spoken text
    const cleanText = this.stripMarkdown(text);
    if (!cleanText.trim()) return of(null as unknown as TtsSynthesizeResponse);

    return this.http.post<TtsSynthesizeResponse>(this.base, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'tts_synthesize',
        arguments: { text: cleanText, play: true },
      },
    });
  }

  /**
   * Strip common markdown formatting for cleaner TTS output.
   * Keeps the semantic content while removing syntax characters.
   */
  private stripMarkdown(text: string): string {
    return text
      // Code blocks — keep content, drop fences
      .replace(/```[\s\S]*?```/g, (match) => {
        const inner = match.replace(/```\w*\n?/g, '').replace(/```/g, '').trim();
        return inner ? `Code: ${inner}` : '';
      })
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Headers
      .replace(/^#{1,6}\s+/gm, '')
      // Bold / italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      // Links — keep text, drop URL
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Blockquotes
      .replace(/^>\s?/gm, '')
      // List markers
      .replace(/^[\s]*[-*+]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // HTML tags
      .replace(/<[^>]*>/g, '')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
