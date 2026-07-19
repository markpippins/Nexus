import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-table-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <div class="app-panel overflow-hidden">
      <table class="app-table">
        <thead>
          <tr>
            <th *ngFor="let _ of colsArray()">
              <app-skeleton height="0.75rem" width="60%"></app-skeleton>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let _ of rowsArray()">
            <td *ngFor="let _ of colsArray()">
              <app-skeleton height="0.875rem" width="80%"></app-skeleton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class TableSkeletonComponent {
  cols = input(4);
  rows = input(6);

  colsArray() {
    return Array(this.cols()).fill(0);
  }

  rowsArray() {
    return Array(this.rows()).fill(0);
  }
}
