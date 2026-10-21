export interface KdfResponse {
  kdfSalt: string;
  kdfIters: number;
}

export interface RegisterRequest {
  email: string;
  authHash: string;
  kdfSalt: string;
  kdfIters: number;
}

export interface RegisterResponse {
  userId: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  expiresIn: number;
}

export interface VaultBlob {
  version: number;
  iv: string;
  ct: string;
  updatedAt: string;
}

export interface VaultPutRequest {
  baseVersion: number;
  iv: string;
  ct: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
}

export interface Entry {
  id: string;
  name: string;
  account: string;
  password: string;
  category: string;
  notes: string;
  fav: boolean;
  ts: number;
  skin: { name: string; rules: Array<'letter' | 'number' | 'poem'> };
}

export interface VaultDoc {
  entries: Entry[];
  categories: string[];
  settings: {
    autoLockMin: number;
    clipboardClearSec: number;
  };
}