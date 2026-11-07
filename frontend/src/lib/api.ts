export const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'alc.token';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  if (remember) localStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.setItem(TOKEN_KEY, token);
}

function detailText(details: unknown) {
  if (!details || typeof details !== 'object') return '';
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  const formErrors = (details as { formErrors?: string[] }).formErrors ?? [];
  const fields = fieldErrors
    ? Object.entries(fieldErrors).flatMap(([key, messages]) => (messages ?? []).map((message) => `${key}: ${message}`))
    : [];
  return [...formErrors, ...fields].join(' ');
}

export function errorText(error: unknown) {
  if (error instanceof ApiError) {
    const extra = detailText(error.details);
    return extra ? `${error.message} ${extra}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const target = API_URL ? new URL(path, API_URL) : path;
  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(API_URL ? `Cannot reach the lending API at ${API_URL}.` : 'Cannot reach the lending API.', 0);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const json = text ? (JSON.parse(text) as { error?: { message?: string; details?: unknown } }) : null;
  if (!response.ok) {
    const signingIn = path.endsWith('/api/auth/login');
    if (response.status === 401 && token && !signingIn) {
      setToken(null);
      window.dispatchEvent(new Event('alc:unauthorized'));
    }
    throw new ApiError(json?.error?.message ?? `Request failed (${response.status})`, response.status, json?.error?.details);
  }
  return json as T;
}
