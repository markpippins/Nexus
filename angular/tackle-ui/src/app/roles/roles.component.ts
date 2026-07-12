import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RolesService, Role } from './roles.service';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="roles-page">
      <section class="roles-header">
        <h2>Roles Registry</h2>
        <p>Canonical agent roles in the tackle schema.</p>
      </section>

      @if (error) {
        <div class="error-banner">{{ error }}</div>
      }

      <!-- Add / edit form -->
      <div class="add-role-form">
        <h3>{{ editingRole ? 'Edit Role' : 'Add Role' }}</h3>
        <div class="form-row">
          <input
            type="text"
            placeholder="Role name (e.g. engineer)"
            [(ngModel)]="newName"
            [disabled]="!!editingRole"
          />
          <input
            type="text"
            placeholder="Description"
            [(ngModel)]="newDescription"
          />
          <div class="form-actions">
            <button class="btn btn-primary" (click)="save()">
              {{ editingRole ? 'Update' : 'Add' }}
            </button>
            @if (editingRole) {
              <button class="btn btn-ghost" (click)="cancelEdit()">Cancel</button>
            }
          </div>
        </div>
      </div>

      <!-- Loading -->
      @if (loading) {
        <div class="loading">Loading roles...</div>
      }

      <!-- Roles table -->
      @if (!loading) {
        <table class="roles-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (role of roles; track role.id) {
              <tr>
                <td class="role-name">{{ role.name }}</td>
                <td class="role-desc">{{ role.description }}</td>
                <td class="role-date">{{ role.created_at | date:'short' }}</td>
                <td class="role-actions">
                  <button class="btn btn-sm btn-ghost" (click)="startEdit(role)">Edit</button>
                  <button class="btn btn-sm btn-danger" (click)="remove(role)">Delete</button>
                </td>
              </tr>
            }
            @empty {
              <tr>
                <td colspan="4" class="empty-state">No roles registered yet.</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    .roles-page {
      max-width: 800px;
    }
    .roles-header h2 {
      margin: 0 0 0.25rem;
      font-size: 1.5rem;
      color: #f1f5f9;
    }
    .roles-header p {
      margin: 0 0 1.5rem;
      color: #64748b;
      font-size: 0.875rem;
    }

    .error-banner {
      background: #7f1d1d;
      color: #fca5a5;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }

    .add-role-form {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .add-role-form h3 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: #e2e8f0;
    }
    .form-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .form-row input {
      flex: 1;
      min-width: 160px;
      padding: 0.5rem 0.75rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 0.375rem;
      color: #e2e8f0;
      font-size: 0.875rem;
    }
    .form-row input:focus {
      outline: none;
      border-color: #38bdf8;
    }
    .form-actions {
      display: flex;
      gap: 0.5rem;
    }

    .loading {
      color: #64748b;
      text-align: center;
      padding: 2rem 0;
    }

    .roles-table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    .roles-table th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      border-bottom: 1px solid #334155;
      background: #0f172a;
    }
    .roles-table td {
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      border-bottom: 1px solid #1e293b;
    }
    .role-name {
      font-weight: 600;
      color: #38bdf8;
    }
    .role-desc {
      color: #94a3b8;
    }
    .role-date {
      color: #64748b;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .role-actions {
      display: flex;
      gap: 0.5rem;
    }
    .empty-state {
      text-align: center;
      color: #475569;
      padding: 2rem 0;
    }

    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-primary {
      background: #1d4ed8;
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) {
      background: #1e40af;
    }
    .btn-sm {
      padding: 0.25rem 0.625rem;
      font-size: 0.75rem;
    }
    .btn-ghost {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #334155;
    }
    .btn-ghost:hover:not(:disabled) {
      background: #334155;
      color: #e2e8f0;
    }
    .btn-danger {
      background: transparent;
      color: #f87171;
      border: 1px solid #7f1d1d;
    }
    .btn-danger:hover:not(:disabled) {
      background: #7f1d1d;
    }
  `],
})
export class RolesComponent implements OnInit {
  private service = inject(RolesService);

  roles: Role[] = [];
  loading = true;
  error: string | null = null;

  newName = '';
  newDescription = '';
  editingRole: Role | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.service.list().subscribe({
      next: (res) => {
        this.roles = res.roles;
        this.loading = false;
      },
      error: (err) => {
        this.error = `Failed to load roles: ${err.message || 'Unknown error'}`;
        this.loading = false;
      },
    });
  }

  save(): void {
    if (!this.newName.trim()) return;

    this.service.upsert({
      id: this.editingRole?.id,
      name: this.newName.trim(),
      description: this.newDescription.trim() || undefined,
    }).subscribe({
      next: () => {
        this.newName = '';
        this.newDescription = '';
        this.editingRole = null;
        this.load();
      },
      error: (err) => {
        this.error = `Save failed: ${err.message || 'Unknown error'}`;
      },
    });
  }

  startEdit(role: Role): void {
    this.editingRole = role;
    this.newName = role.name;
    this.newDescription = role.description;
  }

  cancelEdit(): void {
    this.editingRole = null;
    this.newName = '';
    this.newDescription = '';
  }

  remove(role: Role): void {
    if (!confirm(`Delete role "${role.name}"?`)) return;

    this.service.delete(role.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = `Delete failed: ${err.message || 'Unknown error'}`;
      },
    });
  }
}
