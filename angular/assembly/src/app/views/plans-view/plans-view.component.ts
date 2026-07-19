import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-plans-view',
  standalone: true,
  template: '',
})
export class PlansViewComponent implements OnInit {
  private router = inject(Router);

  ngOnInit() {
    this.router.navigate(['/work-requests'], { replaceUrl: true });
  }
}
