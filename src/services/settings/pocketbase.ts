import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'homelibrary.settings.pocketbaseEndpoint';

export type EndpointErrorCode = 'invalidUrl' | 'insecureUrl' | 'unreachable' | 'serverResponse';

type EndpointPolicy = {
  allowInsecureDevelopment?: boolean;
};

type HomeLibraryRuntimeConfig = {
  POCKETBASE_URL?: unknown;
};

type RuntimeGlobal = typeof globalThis & {
  __HOMELIBRARY_RUNTIME_CONFIG__?: HomeLibraryRuntimeConfig;
};

export class EndpointConfigurationError extends Error {
  constructor(readonly code: EndpointErrorCode) {
    super(code);
    this.name = 'EndpointConfigurationError';
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '10.0.2.2' ||
    normalized === '10.0.3.2' ||
    normalized.endsWith('.localhost') ||
    isPrivateIpv4(normalized)
  );
}

function defaultAllowsInsecureDevelopment(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function normalizePocketBaseEndpoint(value: string, policy: EndpointPolicy = {}): string {
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
  if (url.username || url.password) {
    throw new EndpointConfigurationError('invalidUrl');
  }
  if (url.protocol === 'http:') {
    const allowInsecureDevelopment = policy.allowInsecureDevelopment ?? defaultAllowsInsecureDevelopment();
    if (!allowInsecureDevelopment || !isLocalDevelopmentHost(url.hostname)) {
      throw new EndpointConfigurationError('insecureUrl');
    }
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function getInjectedPocketBaseEndpoint(): string | undefined {
  const value = (globalThis as RuntimeGlobal).__HOMELIBRARY_RUNTIME_CONFIG__?.POCKETBASE_URL;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return normalizePocketBaseEndpoint(value);
}

export function getBuildTimePocketBaseEndpoint(): string | undefined {
  const buildTimeEndpoint = process.env.EXPO_PUBLIC_POCKETBASE_URL;
  if (!buildTimeEndpoint?.trim()) return undefined;
  return normalizePocketBaseEndpoint(buildTimeEndpoint);
}

export function getDeploymentPocketBaseEndpoint(): string | undefined {
  return getInjectedPocketBaseEndpoint() ?? getBuildTimePocketBaseEndpoint();
}

export async function getRuntimePocketBaseEndpoint(): Promise<string | undefined> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? normalizePocketBaseEndpoint(stored) : undefined;
}

export async function getConfiguredPocketBaseEndpoint(): Promise<string | undefined> {
  return (await getRuntimePocketBaseEndpoint()) ?? getDeploymentPocketBaseEndpoint();
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
