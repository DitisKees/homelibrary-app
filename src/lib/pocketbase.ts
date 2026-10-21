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
  cachedFileToken = null;
  fileTokenRequest = null;
  return pb;
}

export function getPocketBaseEndpoint(): string | undefined {
  return currentEndpoint;
}

export async function clearPocketBaseSession(): Promise<void> {
  authStore.clear();
  await clearPersistedAuth();
  cachedFileToken = null;
  fileTokenRequest = null;
}

export async function hydrateAuthStore(): Promise<void> {
  await prepareAuthStorage();
  const stored = await getPersistedAuth();
  if (!stored) return;

  try {
    const { token, model } = JSON.parse(stored);
    authStore.save(token, model);

    // A persisted user model is not proof of an authenticated session. PocketBase
    // can restore an expired JWT together with its model, which previously made
    // HomeLibrary enter the authenticated UI while every protected API request
    // failed. Reject locally invalid/expired tokens before exposing that model.
    if (!authStore.isValid) {
      await clearPocketBaseSession();
    }
  } catch {
    await clearPocketBaseSession();
  }
}

// A locally unexpired JWT may no longer authenticate after a server restore
// (notably the intentionally disposable demo). PocketBase list rules respond
// with HTTP 200 + zero items when an invalid token is treated as anonymous.
// Only invalidate a session on an explicit authorization failure; networking
// errors (e.g. a sleeping Render service) must leave the login untouched.
let sessionCheck: {
  client: PocketBase;
  token: string;
  promise: Promise<boolean>;
} | null = null;

export function validateServerSession(): Promise<boolean> {
  const client = pb;
  const token = client.authStore.token;
  if (!token || !client.authStore.isValid) return Promise.resolve(false);
  if (sessionCheck?.client === client && sessionCheck.token === token) {
    return sessionCheck.promise;
  }

  const promise = (async () => {
    try {
      await client.collection('users').authRefresh();
      return true;
    } catch (error) {
      // An unrelated endpoint change, logout, or new sign-in must not be
      // invalidated by a response from the old session.
      if (client !== pb || token !== client.authStore.token) return false;
      const status = error && typeof error === 'object' && 'status' in error
        ? (error as { status: unknown }).status
        : undefined;
      if (status === 401 || status === 403) {
        await clearPocketBaseSession();
        return false;
      }
      throw error;
    }
  })();

  sessionCheck = { client, token, promise };
  const cleanup = () => {
    if (sessionCheck?.promise === promise) sessionCheck = null;
  };
  void promise.then(cleanup, cleanup);
  return promise;
}

let cachedFileToken: { token: string; fetchedAt: number } | null = null;
let fileTokenRequest: Promise<string> | null = null;
const FILE_TOKEN_TTL_MS = 5 * 60 * 1000;

async function getFileToken(): Promise<string> {
  if (cachedFileToken && Date.now() - cachedFileToken.fetchedAt < FILE_TOKEN_TTL_MS) {
    return cachedFileToken.token;
  }

  if (!fileTokenRequest) {
    fileTokenRequest = pb.files
      .getToken()
      .then((token) => {
        cachedFileToken = { token, fetchedAt: Date.now() };
        return token;
      })
      .finally(() => {
        fileTokenRequest = null;
      });
  }

  return fileTokenRequest;
}

export async function fileUrl(
  record: { id: string; collectionId: string; collectionName: string },
  filename: string | undefined,
  thumb?: string
): Promise<string | undefined> {
  if (!filename) return undefined;
  const token = await getFileToken();
  return pb.files.getUrl(record, filename, { thumb, token });
}
