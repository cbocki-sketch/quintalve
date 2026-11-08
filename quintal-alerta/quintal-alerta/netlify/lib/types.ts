export interface EventState {
  url: string;
  title: string;
  date: string;
  lotes: string;
  available: boolean;
  since: number;
}
export interface State {
  seeded: boolean;
  lastCheck: number | null;
  lastOk: number | null;
  lastError: string | null;
  failures: number;
  lockUntil: number;
  events: Record<string, EventState>;
  notified: Record<string, { sig: string; at: number }>;
}
export interface PublicStatus {
  now: number;
  lastCheck: number | null;
  lastOk: number | null;
  lastError: string | null;
  events: EventState[];
  intervalMs: number;
  vapidPublicKey: string;
}
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export interface Deps {
  store: KV;
  fetchText: (url: string) => Promise<string>;
  notify: (ev: EventState) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
