import { useSession } from './session';
import { useVaultStore } from './vaultStore';
import { encryptVault } from '../crypto/vault';
import { writeVaultText } from '../storage/vaultFile';
import type { VaultFile } from '../types';
import { VAULT_FORMAT } from '../storage/vaultFile';

const SAVE_DEBOUNCE_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let inflight: Promise<void> | null = null;
let errorHandler: ((message: string) => void) | null = null;

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush().catch((e: Error) => errorHandler?.(e.message));
  }, SAVE_DEBOUNCE_MS);
}

/** 把当前文档加密后写回本地保险箱文件 */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inflight) {
    await inflight.catch(() => undefined);
  }
  const { vaultKey, saltHex, iters } = useSession.getState();
  if (!vaultKey || !saltHex) return;

  const run = (async () => {
    const doc = useVaultStore.getState().getDoc();
    const { iv, ct } = await encryptVault(vaultKey, doc);
    const payload: VaultFile = {
      format: VAULT_FORMAT,
      formatVersion: 1,
      kdf: { salt: saltHex, iters },
      iv,
      ct,
    };
    await writeVaultText(JSON.stringify(payload, null, 2));
  })();

  inflight = run;
  try {
    await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

export function startAutosave(onError?: (message: string) => void): void {
  stopAutosave();
  errorHandler = onError ?? null;
  unsubscribe = useVaultStore.subscribe((state, prev) => {
    if (
      state.entries === prev.entries &&
      state.categories === prev.categories &&
      state.settings === prev.settings
    ) {
      return;
    }
    schedule();
  });
}

export function stopAutosave(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  errorHandler = null;
}
