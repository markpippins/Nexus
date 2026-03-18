import { Component, ChangeDetectionStrategy, signal, viewChild, ElementRef, AfterViewInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiSearchParams } from '../../services/gemini.service.js';

@Component({
  selector: 'app-gemini-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gemini-search.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeminiSearchComponent implements AfterViewInit {
  search = output<GeminiSearchParams>();

  // Parameters
  query = signal('Explain Angular Signals like I am five.');
  systemInstruction = signal('You are a helpful and creative assistant.');
  temperature = signal(0.9);
  topK = signal(1);
  topP = signal(1);
  
  searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  ngAfterViewInit(): void {
    setTimeout(() => {
        this.searchInput().nativeElement.focus();
        this.searchInput().nativeElement.select();
    }, 100);
  }

  performSearch(): void {
    if (!this.query().trim()) return;

    this.search.emit({
      query: this.query(),
      systemInstruction: this.systemInstruction(),
      temperature: this.temperature(),
      topK: this.topK(),
      topP: this.topP(),
    });
  }

  onSliderChange(event: Event, param: 'temperature' | 'topK' | 'topP'): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    switch (param) {
      case 'temperature':
        this.temperature.set(value);
        break;
      case 'topK':
        this.topK.set(value);
        break;
      case 'topP':
        this.topP.set(value);
        break;
    }
  }
}
