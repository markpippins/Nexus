import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header>
      <h1>Tackle UI</h1>
      <nav>
        <a routerLink="/roles">Roles</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #0f172a;
      color: #e2e8f0;
      font-family: system-ui, sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding: 1rem 2rem;
      background: #1e293b;
      border-bottom: 1px solid #334155;
    }
    header h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #38bdf8;
    }
    nav a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.875rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.375rem;
      transition: background 0.15s, color 0.15s;
    }
    nav a:hover, nav a.active {
      color: #e2e8f0;
      background: #334155;
    }
    main {
      max-width: 960px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
  `],
})
export class AppComponent {}
