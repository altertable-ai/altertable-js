import type { Environment } from '../types';
import type { AdapterEvent, Adapters } from './types';

export interface AdapterIngress {
  emit(event: AdapterEvent): void;
  onError(error: unknown): void;
  getEnvironment(): Environment;
}

export interface AdapterSubscription {
  update(adapters: Adapters | undefined): void;
  dispose(): void;
}
