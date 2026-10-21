import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  health,
  getKdf,
  register,
  login,
  getVault,
  putVault,
  ApiError,
} from '../api/client';

const BASE = 'http://localhost:8000/api/v1';

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('health returns status', async () => {
    mockFetch(200, { status: 'ok', version: '0.1.0' });
    const res = await health();
    expect(res.status).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(`${BASE}/health`, expect.any(Object));
  });

  it('getKdf returns salt and iters', async () => {
    mockFetch(200, { kdfSalt: 'a1b2', kdfIters: 200000 });
    const res = await getKdf('alice@example.com');
    expect(res.kdfSalt).toBe('a1b2');
    expect(res.kdfIters).toBe(200000);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/auth/kdf?email=alice%40example.com`,
      expect.any(Object),
    );
  });

  it('register returns userId', async () => {
    mockFetch(201, { userId: 'abc123' });
    const res = await register({
      email: 'alice@example.com',
      authHash: 'aa'.repeat(32),
      kdfSalt: 'bb'.repeat(16),
      kdfIters: 200000,
    });
    expect(res.userId).toBe('abc123');
  });

  it('login returns token', async () => {
    mockFetch(200, { token: 'jwt', userId: 'abc', expiresIn: 86400 });
    const res = await login('alice@example.com', 'aa'.repeat(32));
    expect(res.token).toBe('jwt');
  });

  it('getVault returns blob', async () => {
    mockFetch(200, {
      version: 3,
      iv: 'aa'.repeat(12),
      ct: 'bb'.repeat(10),
      updatedAt: '2026-10-20T12:00:00Z',
    });
    const res = await getVault('token');
    expect(res).not.toBeNull();
    expect(res!.version).toBe(3);
  });

  it('getVault returns null on 404 VAULT_EMPTY', async () => {
    mockFetch(404, { error: { code: 'VAULT_EMPTY', message: '未创建' } });
    const res = await getVault('token');
    expect(res).toBeNull();
  });

  it('getVault throws on other 404', async () => {
    mockFetch(404, { error: { code: 'USER_NOT_FOUND', message: '无' } });
    await expect(getVault('token')).rejects.toThrow(ApiError);
  });

  it('putVault returns version', async () => {
    mockFetch(200, { version: 4, updatedAt: '2026-10-20T12:05:00Z' });
    const res = await putVault('token', { baseVersion: 3, iv: 'aa'.repeat(12), ct: 'bb' });
    expect(res.version).toBe(4);
  });

  it('putVault throws on 409 conflict', async () => {
    mockFetch(409, {
      error: { code: 'VERSION_CONFLICT', message: '冲突', detail: { currentVersion: 5 } },
    });
    await expect(putVault('token', { baseVersion: 3, iv: '', ct: '' })).rejects.toThrow(ApiError);
  });
});