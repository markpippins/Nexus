import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Role {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RolesResponse {
  count: number;
  roles: Role[];
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private http = inject(HttpClient);
  private base = '/api/config';

  list(): Observable<RolesResponse> {
    return this.http.get<RolesResponse>(`${this.base}/roles`);
  }

  get(idOrName: string): Observable<Role> {
    return this.http.get<Role>(`${this.base}/role/${encodeURIComponent(idOrName)}`);
  }

  upsert(role: { id?: string; name: string; description?: string }): Observable<{ saved: boolean; role: Role }> {
    return this.http.post<{ saved: boolean; role: Role }>(`${this.base}/role`, role);
  }

  delete(idOrName: string): Observable<{ deleted: boolean; id: string }> {
    return this.http.delete<{ deleted: boolean; id: string }>(`${this.base}/role/${encodeURIComponent(idOrName)}`);
  }
}
