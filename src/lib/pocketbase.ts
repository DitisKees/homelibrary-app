import PocketBase, { AsyncAuthStore } from 'pocketbase';
import {
  clearPersistedAuth,
  getPersistedAuth,
  prepareAuthStorage,
  setPersistedAuth,
} from '@/lib/authStorage';
import { ensurePocketBaseEventSource } from '@/lib/eventSource';

const UNCONFIGURED_URL = 'http://127.0.0.1';

let authStore = createAuthStore();
// This binding is replaced after endpoint configuration has loaded. Services
// import the live binding, so screens never need to handle base URLs.
export let pb = new PocketBase(UNCONFIGURED_URL, authStore);
let currentEndpoint: string | undefined;

function createAuthStore() {
  return new AsyncAuthStore({
    save: setPersistedAuth,
    initial: undefined,
    clear: clearPersistedAuth,
  });
}

export function initializePocketBase(endpoint: string): PocketBase {
  ensurePocketBaseEventSource();
  authStore = createAuthStore();
  pb = new PocketBase(endpoint, authStore);
  currentEndpoint = endpoint;
  return pb;
}

export function getPocketBaseEndpoint(): string | undefined {
  return currentEndpoint;
}

export async function clearPocketBaseSession(): Promise<void> {
  authStore.clear();
  await clearPersistedAuth();
  cachedFileToken = null;
}

export async function hydrateAuthStore(): Promise<void> {
  await prepareAuthStorage();
  const stored = await getPersistedAuth();
  if (!stored) return;
  try {
    const { token, model } = JSON.parse(stored);
    authStore.save(token, model);
  } catch {
    await clearPersistedAuth();
  }
}

let cachedFileToken: { token: string; fetchedAt: number } | null = null;
const FILE_TOKEN_TTL_MS = 5 * 60 * 1000;

async function getFileToken(): Promise<string> {
  if (cachedFileToken && Date.now() - cachedFileToken.fetchedAt < FILE_TOKEN_TTL_MS) {
    return cachedFileToken.token;
  }
  const token = await pb.files.getToken();
  cachedFileToken = { token, fetchedAt: Date.now() };
  return token;
}

export async function fileUrl(
  record: { id: string; collectionId: string; collectionName: string },
  filename: string | undefined,
  thumb?: string
): Promise<string | undefined> {
  if (!filename) return undefined;
  const token = await getFileToken();
  cachedFileToken = { token, fetchedAt: Date.now() };
  return pb.files.getUrl(record, filename, { thumb, token });
}
