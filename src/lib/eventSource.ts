import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

type SseEvent = {
  type: string;
  data: string;
  lastEventId: string;
};

type SseErrorEvent = {
  type: 'error';
  error: unknown;
};

type EventLike = SseEvent | SseErrorEvent | { type: 'open' };
type Listener = ((event: EventLike) => void) | { handleEvent: (event: EventLike) => void };

export function parseSseBlock(block: string): SseEvent | undefined {
  let type = 'message';
  let lastEventId = '';
  const data: string[] = [];

  for (const line of block.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(':')) continue;

    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') type = value || 'message';
    else if (field === 'data') data.push(value);
    else if (field === 'id') lastEventId = value;
  }

  if (data.length === 0) return undefined;
  return { type, data: data.join('\n'), lastEventId };
}

class ExpoEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = ExpoEventSource.CONNECTING;
  readonly OPEN = ExpoEventSource.OPEN;
  readonly CLOSED = ExpoEventSource.CLOSED;
  readonly url: string;
  readonly withCredentials = false;

  readyState = ExpoEventSource.CONNECTING;
  onopen: ((event: { type: 'open' }) => void) | null = null;
  onmessage: ((event: SseEvent) => void) | null = null;
  onerror: ((event: SseErrorEvent) => void) | null = null;

  private readonly controller = new AbortController();
  private readonly listeners = new Map<string, Set<Listener>>();
  private closed = false;

  constructor(url: string | URL) {
    this.url = String(url);
    void this.connect();
  }

  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(type);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = ExpoEventSource.CLOSED;
    this.controller.abort();
    this.listeners.clear();
  }

  private emit(type: string, event: EventLike): void {
    const propertyListener =
      type === 'open' ? this.onopen : type === 'message' ? this.onmessage : type === 'error' ? this.onerror : null;
    propertyListener?.(event as never);

    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }

  private async connect(): Promise<void> {
    try {
      const response = await expoFetch(this.url, {
        headers: { Accept: 'text/event-stream' },
        signal: this.controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`EventSource request failed with status ${response.status}.`);
      }

      this.readyState = ExpoEventSource.OPEN;
      this.emit('open', { type: 'open' });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = this.dispatchCompleteBlocks(buffer);
      }

      buffer += decoder.decode();
      this.dispatchCompleteBlocks(`${buffer}\n\n`);
      if (!this.closed) throw new Error('EventSource connection closed unexpectedly.');
    } catch (error) {
      if (this.closed) return;
      this.readyState = ExpoEventSource.CONNECTING;
      this.emit('error', { type: 'error', error });
    }
  }

  private dispatchCompleteBlocks(input: string): string {
    let buffer = input;
    const boundary = /(?:\r\n|\r|\n){2}/;

    while (true) {
      const match = boundary.exec(buffer);
      if (!match || match.index === undefined) return buffer;

      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const event = parseSseBlock(block);
      if (event) this.emit(event.type, event);
    }
  }
}

export function ensurePocketBaseEventSource(): void {
  if (Platform.OS === 'web' || typeof globalThis.EventSource !== 'undefined') return;

  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    writable: true,
    value: ExpoEventSource,
  });
}
