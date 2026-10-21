import type {
  KdfResponse,
  RegisterRequest,
  RegisterResponse,
  LoginResponse,
  VaultBlob,
  VaultPutRequest,
  ApiErrorBody,
} from './types';

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  detail?: unknown;

  constructor(code: string, message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...opts.headers,
    },
  });

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // ignore parse error
    }
    if (body?.error) {
      throw new ApiError(body.error.code, body.error.message, res.status, body.error.detail);
    }
    throw new ApiError('UNKNOWN', res.statusText, res.status);
  }

  return res.json() as Promise<T>;
}

export function health(): Promise<{ status: string; version: string }> {
  return request(`${BASE}/health`);
}

export function getKdf(email: string): Promise<KdfResponse> {
  return request(`${BASE}/auth/kdf?email=${encodeURIComponent(email)}`);
}

export function register(req: RegisterRequest): Promise<RegisterResponse> {
  return request(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function login(email: string, authHash: string): Promise<LoginResponse> {
  return request(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, authHash }),
  });
}

export async function getVault(token: string): Promise<VaultBlob | null> {
  try {
    return await request<VaultBlob>(`${BASE}/vault`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'VAULT_EMPTY') {
      return null;
    }
    throw e;
  }
}

export function putVault(
  token: string,
  req: VaultPutRequest,
): Promise<{ version: number; updatedAt: string }> {
  return request(`${BASE}/vault`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });
}