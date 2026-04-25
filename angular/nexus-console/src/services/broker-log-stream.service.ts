import { Injectable, inject } from '@angular/core';
import { BrokerProfileService } from './broker-profile.service.js';

export interface BrokerTrafficEvent {
  eventId: string;
  timestamp: string;
  durationMs: number;
  requestId: string | null;
  service: string | null;
  operation: string | null;
  ok: boolean;
  httpStatus: number;
  source: string;
  request: unknown;
  response: unknown;
  errorMessage: string | null;
}

export interface BrokerLogStreamStatusEvent {
  type: 'status';
  status: 'connected' | 'stopped' | 'error';
  message: string;
  url?: string;
}

export interface BrokerLogStreamLogEvent {
  type: 'log';
  payload: BrokerTrafficEvent;
}

export type BrokerLogStreamEvent = BrokerLogStreamStatusEvent | BrokerLogStreamLogEvent;

export interface BrokerLogStartResult {
  started: boolean;
  message: string;
  url?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BrokerLogStreamService {
  private brokerProfileService = inject(BrokerProfileService);
  private listeners = new Set<(event: BrokerLogStreamEvent) => void>();
  private eventSource: EventSource | null = null;
  private currentUrl: string | null = null;

  subscribe(listener: (event: BrokerLogStreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): BrokerLogStartResult {
    if (this.eventSource) {
      return {
        started: false,
        message: 'logging already active',
        url: this.currentUrl ?? undefined,
      };
    }

    const activeProfile = this.brokerProfileService.activeProfile();
    const rawBrokerUrl = activeProfile?.brokerUrl?.trim();
    if (!rawBrokerUrl) {
      return {
        started: false,
        message: 'no active broker profile is configured',
      };
    }

    const streamUrl = this.buildStreamUrl(rawBrokerUrl);
    const source = new EventSource(streamUrl, { withCredentials: true });
    this.eventSource = source;
    this.currentUrl = streamUrl;

    source.addEventListener('broker-traffic', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as BrokerTrafficEvent;
        this.emit({ type: 'log', payload });
      } catch (error) {
        this.emit({
          type: 'status',
          status: 'error',
          message: `failed to parse broker log event: ${error instanceof Error ? error.message : String(error)}`,
          url: streamUrl,
        });
      }
    });

    source.onopen = () => {
      this.emit({
        type: 'status',
        status: 'connected',
        message: `connected to ${streamUrl}`,
        url: streamUrl,
      });
    };

    source.onerror = () => {
      this.cleanupSource(false);
      this.emit({
        type: 'status',
        status: 'error',
        message: `broker log stream disconnected from ${streamUrl}`,
        url: streamUrl,
      });
    };

    return {
      started: true,
      message: `started broker logging for ${streamUrl}`,
      url: streamUrl,
    };
  }

  stop(): BrokerLogStartResult {
    if (!this.eventSource) {
      return {
        started: false,
        message: 'logging is not active',
      };
    }

    const stoppedUrl = this.currentUrl ?? undefined;
    this.cleanupSource(true);
    this.emit({
      type: 'status',
      status: 'stopped',
      message: `stopped broker logging${stoppedUrl ? ` for ${stoppedUrl}` : ''}`,
      url: stoppedUrl,
    });

    return {
      started: true,
      message: `stopped broker logging${stoppedUrl ? ` for ${stoppedUrl}` : ''}`,
      url: stoppedUrl,
    };
  }

  private emit(event: BrokerLogStreamEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private cleanupSource(close: boolean): void {
    if (this.eventSource && close) {
      this.eventSource.close();
    }
    this.eventSource = null;
    this.currentUrl = null;
  }

  private buildStreamUrl(rawBrokerUrl: string): string {
    let normalized = rawBrokerUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }

    normalized = normalized.replace(/\/+$/, '');

    if (normalized.endsWith('/api/v1/broker/submitRequest')) {
      normalized = normalized.slice(0, -'/submitRequest'.length);
    } else if (!normalized.endsWith('/api/v1/broker')) {
      normalized = `${normalized}/api/v1/broker`;
    }

    return `${normalized}/logs/stream`;
  }
}
