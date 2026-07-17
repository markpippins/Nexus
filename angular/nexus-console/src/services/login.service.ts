import { Injectable, inject } from '@angular/core';
import { BrokerService } from './broker.service.js';
import { User } from '../models/user.model.js';
import { BrokerProfile } from '../models/broker-profile.model.js';

const SERVICE_NAME = 'loginService';

interface LoginResponse {
  token: string;
  userId?: string;
  message?: string;
  ok: boolean;
  admin?: boolean;
  errors?: { message: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private brokerService = inject(BrokerService);

  private constructBrokerUrl(baseUrl: string): string {
    let fullUrl = baseUrl.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `http://${fullUrl}`;
    }
    if (fullUrl.endsWith('/')) {
      fullUrl = fullUrl.slice(0, -1);
    }
    fullUrl += '/api/v1/broker/submitRequest';
    return fullUrl;
  }

  async isLoggedIn(profile: BrokerProfile, token: string): Promise<boolean> {
    try {
      const response = await this.brokerService.submitRequest<{ ok: boolean; data: boolean }>(
        this.constructBrokerUrl(profile.brokerUrl ?? ''),
        SERVICE_NAME,
        'isLoggedIn',
        { token }
      );
      return response?.data === true;
    } catch {
      return false;
    }
  }

  async logout(profile: BrokerProfile, token: string): Promise<void> {
    await this.brokerService.submitRequest<boolean>(
      this.constructBrokerUrl(profile.brokerUrl ?? ''),
      SERVICE_NAME,
      'logout',
      { token }
    );
  }

  async login(profile: BrokerProfile, email: string, password: string): Promise<{ user: User; token: string }> {
    const response = await this.brokerService.submitRequest<LoginResponse>(this.constructBrokerUrl(profile.brokerUrl ?? ''), SERVICE_NAME, 'login', {
      email,
      identifier: password
    });

    if (!response || !response.ok || !response.token) {
      const errorMessage = response?.errors?.map(e => e.message).join(', ') || response?.message || 'Login failed: No token received.';
      throw new Error(errorMessage);
    }

    // The backend returns userId and admin in the LoginResponse.
    // We derive the alias from the email prefix for display purposes.
    const alias = email.split('@')[0];
    const user: User = {
      id: response.userId || alias,
      profileId: profile.id,
      alias,
      email,
      avatarUrl: '',
      admin: response.admin
    };

    return { user, token: response.token };
  }
}