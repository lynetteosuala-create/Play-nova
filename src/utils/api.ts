const PLAYER_TOKEN_KEY = 'gv_player_token';
const ADMIN_TOKEN_KEY = 'gv_admin_token';

export class SessionExpiredError extends Error {
  code: string;
  constructor(message: string, code = 'SESSION_EXPIRED') {
    super(message);
    this.name = 'SessionExpiredError';
    this.code = code;
  }
}

export function getStoredPlayerToken(): string | null {
  try {
    return localStorage.getItem(PLAYER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredPlayerToken(token: string | null) {
  try {
    if (token) localStorage.setItem(PLAYER_TOKEN_KEY, token);
    else localStorage.removeItem(PLAYER_TOKEN_KEY);
  } catch {
    // ignore storage limits
  }
}

export function getStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore storage limits
  }
}

const GUEST_RECOVERY_KEY = 'gv_guest_recovery_key';

export function getStoredRecoveryKey(): string | null {
  try {
    return localStorage.getItem(GUEST_RECOVERY_KEY);
  } catch {
    return null;
  }
}

export function setStoredRecoveryKey(key: string | null) {
  try {
    if (key) localStorage.setItem(GUEST_RECOVERY_KEY, key);
    else localStorage.removeItem(GUEST_RECOVERY_KEY);
  } catch {
    // ignore storage limits
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  { suppressSessionEvent = false }: { suppressSessionEvent?: boolean } = {}
): Promise<T> {
  const token = getStoredPlayerToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !suppressSessionEvent && token && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gv:session-expired', {
          detail: { message: data.error || 'Your session expired. Sign back in to continue.' },
        })
      );
      throw new SessionExpiredError(
        data.error || 'Your session expired. Please sign in again.',
        data.code || 'SESSION_EXPIRED'
      );
    }
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data as T;
}

export async function adminFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const adminToken = getStoredAdminToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (adminToken && !headers.has('x-admin-token')) {
    headers.set('x-admin-token', adminToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Admin request failed (${res.status})`);
  }
  return data as T;
}
