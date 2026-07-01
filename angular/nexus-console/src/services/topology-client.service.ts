import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const TOPOLOGY_URL = 'http://localhost:8084';

@Injectable({ providedIn: 'root' })
export class TopologyClientService {
  private http = inject(HttpClient);

  async get<T>(path: string): Promise<T[]> {
    const url = `${TOPOLOGY_URL}/api/v1/${path}`;
    const response: any = await firstValueFrom(this.http.get(url));
    return response.data ?? [];
  }

  async post<T>(path: string, body: Partial<T>): Promise<T> {
    const url = `${TOPOLOGY_URL}/api/v1/${path}`;
    return firstValueFrom(this.http.post<T>(url, body));
  }

  async put<T>(path: string, id: number | string, body: Partial<T>): Promise<T> {
    const url = `${TOPOLOGY_URL}/api/v1/${path}/${id}`;
    return firstValueFrom(this.http.put<T>(url, body));
  }

  async delete(path: string, id: number | string): Promise<void> {
    const url = `${TOPOLOGY_URL}/api/v1/${path}/${id}`;
    await firstValueFrom(this.http.delete(url));
  }
}
