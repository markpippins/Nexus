import { Component, Input, Output, EventEmitter, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  @Input() label = 'Feed';
  @Input() currentTheme: 'light' | 'steel' | 'dark' = 'light';
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleMobileSidebar = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();

  searchOpen = false;
  searchQuery = '';

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  constructor(private router: Router) {}

  goHome() {
    this.router.navigate(['/feed']);
  }

  openSearch() {
    this.searchOpen = true;
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    }, 0);
  }

  closeSearch() {
    this.searchOpen = false;
  }

  onSearchSubmit(event: Event) {
    event.preventDefault();
    const q = this.searchQuery.trim();
    if (q) {
      this.router.navigate(['/search'], { queryParams: { q } });
      this.searchOpen = false;
      this.searchQuery = '';
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.openSearch();
    }
    if (event.key === 'Escape') {
      this.closeSearch();
    }
  }
}
