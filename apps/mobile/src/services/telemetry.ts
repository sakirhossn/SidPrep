import { getPlatformOS, getPlatformVersion } from './platform';
import { TelemetryEvent, TelemetryEventCode } from '@sidprep/contracts';

const APP_VERSION = '2.0.0';
const MAX_QUEUE_SIZE = 100; // Capped storage discipline

class TelemetryService {
  private queue: TelemetryEvent[] = [];
  private isFlushing = false;
  private anonymousUserId: string | null = null;
  private baseUrl = 'https://api.sidprep.in/v1';

  public setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  public setAnonymousUserId(id: string | null) {
    this.anonymousUserId = id;
  }

  public generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `corr_${timestamp}_${random}`;
  }

  public track(
    eventCode: TelemetryEventCode,
    metadata?: Record<string, string | number | boolean>,
    correlationId?: string
  ): void {
    // Sanitization check: Ensure no sensitive keys leak
    const sanitizedMetadata: Record<string, string | number | boolean> = {};
    if (metadata) {
      for (const [key, val] of Object.entries(metadata)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('otp') ||
          lowerKey.includes('token') ||
          lowerKey.includes('password') ||
          lowerKey.includes('email') ||
          lowerKey.includes('phone') ||
          lowerKey.includes('answer')
        ) {
          continue; // Strip forbidden sensitive fields
        }
        sanitizedMetadata[key] = val;
      }
    }

    const os = getPlatformOS();
    const event: TelemetryEvent = {
      eventId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventCode,
      anonymousUserId: this.anonymousUserId ?? undefined,
      appVersion: APP_VERSION,
      osPlatform: os === 'android' ? 'android' : os === 'ios' ? 'ios' : 'unknown',
      osVersion: getPlatformVersion(),
      networkType: 'unknown',
      correlationId: correlationId ?? this.generateCorrelationId(),
      timestamp: new Date().toISOString(),
      metadata: Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined
    };

    // Push with capped queue size
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift(); // Evict oldest event to preserve memory
    }
    this.queue.push(event);

    // Auto-flush if batch size reached
    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  public async flush(): Promise<number> {
    if (this.isFlushing || this.queue.length === 0) return 0;
    this.isFlushing = true;

    const batch = [...this.queue];
    try {
      const response = await fetch(`${this.baseUrl}/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': this.generateCorrelationId()
        },
        body: JSON.stringify({ events: batch })
      });

      if (response.ok) {
        // Remove successfully submitted batch
        this.queue = this.queue.slice(batch.length);
        return batch.length;
      }
      return 0;
    } catch {
      // Retain in queue for next flush attempt
      return 0;
    } finally {
      this.isFlushing = false;
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const telemetry = new TelemetryService();
