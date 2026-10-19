import type { AdapterEvent, Adapters } from './types';

export interface AdapterIngress {
  emit(event: AdapterEvent): void;
  onError(error: unknown): void;
}

export interface AdapterSubscription {
  update(adapters: Adapters | undefined): void;
  dispose(): void;
}
