import { Component, ChangeDetectionStrategy, output, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalConfig, LocalConfigService } from '../../services/local-config.service.js';

@Component({
  selector: 'app-local-config-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './local-config-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'close.emit()',
  },
})
export class LocalConfigDialogComponent implements OnInit {
  private localConfigService = inject(LocalConfigService);
  
  close = output<void>();
  save = output<LocalConfig>();

  formState = signal<LocalConfig>({ sessionName: '', defaultImageUrl: '', logBrokerMessages: false, healthCheckDelayMinutes: 3 });

  ngOnInit(): void {
    this.formState.set(this.localConfigService.currentConfig());
  }

  onValueChange(event: Event, field: 'sessionName' | 'defaultImageUrl'): void {
    const value = (event.target as HTMLInputElement).value;
    this.formState.update(state => ({ ...state, [field]: value }));
  }
  
  onNumberValueChange(event: Event, field: 'healthCheckDelayMinutes'): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.formState.update(state => ({ ...state, [field]: isNaN(value) || value < 1 ? 1 : value }));
  }

  onCheckboxChange(event: Event, field: 'logBrokerMessages'): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.formState.update(state => ({ ...state, [field]: checked }));
  }

  onSave(): void {
    this.save.emit(this.formState());
  }
}