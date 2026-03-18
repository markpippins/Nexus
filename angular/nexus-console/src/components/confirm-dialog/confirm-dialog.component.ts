import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'onCancel()',
  },
})
export class ConfirmDialogComponent {
  title = input.required<string>();
  message = input.required<string>();
  confirmButtonText = input('OK');
  showDontShowAgainOption = input(false);

  confirm = output<void>();
  close = output<void>();
  dontShowAgainChange = output<boolean>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.close.emit();
  }
}