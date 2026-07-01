import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-create-user-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './create-user-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateUserDialogComponent {
    private fb = inject(FormBuilder);
    private http = inject(HttpClient);

    isOpen = input.required<boolean>();
    baseUrl = input.required<string>();

    close = output<void>();
    created = output<void>();

    form = this.fb.group({
        alias: ['', Validators.required],
        email: [''],
        identifier: ['', Validators.required],
        admin: [false],
    });

    isSaving = signal(false);
    error = signal<string | null>(null);

    onCancel() {
        this.close.emit();
    }

    async onSubmit() {
        if (this.form.invalid) return;
        this.isSaving.set(true);
        this.error.set(null);
        try {
            const url = `${this.baseUrl()}/api/v1/users`;
            await firstValueFrom(this.http.post(url, this.form.value));
            this.created.emit();
            this.close.emit();
        } catch (e: any) {
            this.error.set(e?.error?.message || 'Failed to create user');
        } finally {
            this.isSaving.set(false);
        }
    }
}
