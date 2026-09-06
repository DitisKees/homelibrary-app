import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'homelibrary.settings.pocketbaseEndpoint';

export type EndpointErrorCode = 'invalidUrl' | 'unreachable' | 'serverResponse';

export class EndpointConfigurationError extends Error {
  constructor(readonly code: EndpointErrorCode) {
    super(code);
    this.name = 'EndpointConfigurationError';
  }
}

export function normalizePocketBaseEndpoint(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new EndpointConfigurationError('invalidUrl');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EndpointConfigurationError('invalidUrl');
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function getBuildTimePocketBaseEndpoint(): string | undefined {
  const buildTimeEndpoint = process.env.EXPO_PUBLIC_POCKETBASE_URL;
  if (!buildTimeEndpoint?.trim()) return undefined;
  return normalizePocketBaseEndpoint(buildTimeEndpoint);
}

export async function getRuntimePocketBaseEndpoint(): Promise<string | undefined> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? normalizePocketBaseEndpoint(stored) : undefined;
}

export async function getConfiguredPocketBaseEndpoint(): Promise<string | undefined> {
  return (await getRuntimePocketBaseEndpoint()) ?? getBuildTimePocketBaseEndpoint();
}

export async function setRuntimePocketBaseEndpoint(endpoint: string): Promise<string> {
  const normalized = normalizePocketBaseEndpoint(endpoint);
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  return normalized;
}

export async function clearRuntimePocketBaseEndpoint(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function testPocketBaseEndpoint(endpoint: string): Promise<string> {
  const normalized = normalizePocketBaseEndpoint(endpoint);
  let response: Response;
  try {
    response = await fetch(`${normalized}/api/health`);
  } catch {
    throw new EndpointConfigurationError('unreachable');
  }
  if (!response.ok) throw new EndpointConfigurationError('serverResponse');
  return normalized;
}

export const pocketBaseEndpointStorageKey = STORAGE_KEY;
