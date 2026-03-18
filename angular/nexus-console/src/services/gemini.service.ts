import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

// We assume the build process exposes API_KEY from .env as process.env.API_KEY
declare const process: any;

export interface GeminiSearchParams {
  query: string;
  systemInstruction?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    let apiKey: string | undefined;
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        apiKey = process.env.API_KEY;
      }
    } catch (e) {
      console.warn('Could not access process.env.API_KEY. Gemini service will run in mock mode.');
    }

    if (apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (e) {
        console.error("Failed to initialize GoogleGenAI", e);
        this.ai = null;
      }
    }
  }

  async search(paramsOrQuery: string | GeminiSearchParams): Promise<string> {
    const params: GeminiSearchParams = typeof paramsOrQuery === 'string' ? { query: paramsOrQuery } : paramsOrQuery;
    const { query, systemInstruction, temperature, topK, topP } = params;
    
    if (!this.ai) {
      console.log(`Simulating Gemini search for: ${query}`);
      return Promise.resolve(
`Certainly! Here is a summary based on your query for "${query}":

**Key Points:**
- **Definition:** ${query} is a concept/term that is often discussed in various fields.
- **History:** Its origins can be traced back to ancient times, evolving significantly in the 20th century.
- **Modern Relevance:** Today, ${query} plays a crucial role in technology, science, and culture, impacting daily life in numerous ways.

This is a generated summary. For more detailed information, consider consulting academic sources or official documentation.`
      );
    }
    
    if (!query) {
      return '';
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
          ...(systemInstruction !== undefined && { systemInstruction }),
          ...(temperature !== undefined && { temperature }),
          ...(topK !== undefined && { topK }),
          ...(topP !== undefined && { topP }),
        }
      });
      return response.text ?? '';
    } catch(e) {
      console.error('Error calling Gemini API:', e);
      return `Error: Could not get a response from the Gemini API. ${(e as Error).message}`;
    }
  }
}