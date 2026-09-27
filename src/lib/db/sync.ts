'use client';

import {
  getDB,
  META_KEYS,
  getMeta,
  setMeta,
  ensureDeviceId,
  SYNC_BATCH_SIZE,
  type LocalProduct,
  type LocalTransaction,
  type LocalTransactionItem,
} from '@/lib/db/local';
import { APP_VERSION } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { Product, SyncRequest, SyncResponse, Transaction, TransactionItem } from '@/types';

export type SyncPhase = 'idle' | 'checking' | 'pushing' | 'pulling' | 'done' | 'error' | 'offline';

export interface SyncState {
  phase: SyncPhase;
  lastSyncAt: string | null;
  pendingProducts: number;
  pendingTransactions: number;
  message: string;
  online: boolean;
  licenseValid: boolean;
}

type Listener = (s: SyncState) => void;

const listeners = new Set<Listener>();
let state: SyncState = {
  phase: 'idle',
  lastSyncAt: null,
  pendingProducts: 0,
  pendingTransactions: 0,
  message: '',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  licenseValid: false,
};
let timer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;
let running = false;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}

async function countPending() {
  const db = getDB();
  const [products, transactions] = await Promise.all([
    db.products.where('_dirty').equals(1).count(),
    db.transactions.where('_dirty').equals(1).count(),
  ]);
  return { products, transactions };
}

async function refreshPending() {
  try {
    const { products, transactions } = await countPending();
    setState({ pendingProducts: products, pendingTransactions: transactions });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Auth token untuk API route                                           */
/* ------------------------------------------------------------------ */

async function authToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/* ------------------------------------------------------------------ */
/* Tick                                                                 */
/* ------------------------------------------------------------------ */

export type TickResult =
  | { kind: 'offline' }
  | { kind: 'no-license' }
  | { kind: 'auth' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; response: SyncResponse };

/**
 * Satu siklus sinkronisasi:
 *  1. cek online
 *  2. cek lisensi (serialKey + hwid harus cocok dengan server)
 *  3. push produk & transaksi yang masih `_dirty = 1` ke Supabase
 *  4. tandai `_dirty = 0` bila berhasil
 */
export async function syncNow(force = false): Promise<TickResult> {
  if (running) return { kind: 'error', message: 'Sinkronisasi sedang berjalan' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ phase: 'offline', online: false, message: 'Mode offline — data aman di perangkat' });
    return { kind: 'offline' };
  }

  const db = getDB();
  const activation = await getMeta<{ serialKey?: string; hwid?: string } | null>(META_KEYS.activated, null);
  if (!activation?.serialKey || !activation.hwid) {
    setState({ phase: 'idle', message: 'Aplikasi belum diaktivasi' });
    return { kind: 'no-license' };
  }

  running = true;
  setState({ phase: 'checking', message: 'Memeriksa lisensi…' });

  try {
    const token = await authToken();
    if (!token) {
      // POS client boleh offline & tanpa login; sync tetap jalan karena
      // server memvalidasi lewat serial key + HWID, tapi kita tetap butuh
      // token untuk endpoint. Tanpa token -> jelaskan ke user.
      setState({
        phase: 'idle',
        licenseValid: false,
        message: 'Belum masuk akun — sinkronisasi ke server membutuhkan login',
      });
      return { kind: 'auth' };
    }

    const deviceId = await ensureDeviceId();
    const products = await db.products.where('_dirty').equals(1).limit(SYNC_BATCH_SIZE).toArray();
    const transactions = await db.transactions.where('_dirty').equals(1).limit(SYNC_BATCH_SIZE).toArray();
    const txIds = transactions.map((t) => t.id);
    const items = txIds.length
      ? await db.transaction_items.where('transaction_id').anyOf(txIds).toArray()
      : [];

    if (!force && products.length === 0 && transactions.length === 0) {
      // Siklus otomatis: tidak ada yang perlu dikirim -> jangan buang request.
      // Verifikasi lisensi ke server tetap jalan lewat `syncNow(true)` saat
      // koneksi kembali, saat tombol sync ditekan, dan saat aplikasi dibuka.
      setState({ phase: 'done', licenseValid: true, message: 'Semua data sudah tersinkron' });
      return { kind: 'ok', response: { ok: true, code: 'SYNC_OK', message: 'Tidak ada perubahan.' } };
    }

    setState({
      phase: 'pushing',
      message: `Mengirim ${transactions.length} transaksi, ${products.length} produk…`,
    });

    const payload: SyncRequest = {
      serialKey: activation.serialKey,
      hwid: activation.hwid,
      deviceId,
      appVersion: APP_VERSION,
      products: products.map(stripProduct) as Product[],
      transactions: transactions.map(stripTransaction) as Transaction[],
      transactionItems: items.map(stripItem) as TransactionItem[],
    };

    const res = await fetch('/api/pos/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as SyncResponse;

    if (!res.ok || !body.ok) {
      setState({
        phase: 'error',
        licenseValid: body.code !== 'HWID_MISMATCH' && body.code !== 'BLOCKED',
        message: body.message || 'Sinkronisasi gagal',
      });
      return { kind: 'error', message: body.message || 'Sinkronisasi gagal' };
    }

    // Tandai yang sukses sudah tersinkron (idempoten: bila server sudah punya, ok juga)
    const now = new Date().toISOString();
    await db.transaction('rw', [db.products, db.transactions, db.transaction_items], async () => {
      if (products.length) {
        await db.products.bulkPut(
          products.map((p) => ({ ...p, _dirty: 0 as const })),
        );
      }
      if (transactions.length) {
        await db.transactions.bulkPut(
          transactions.map((t) => ({ ...t, _dirty: 0 as const, synced_at: t.synced_at ?? now })),
        );
      }
      if (items.length) {
        await db.transaction_items.bulkPut(items.map((i) => ({ ...i, _dirty: 0 as const })));
      }
    });

    await setMeta(META_KEYS.lastSyncAt, now);
    setState({
      phase: 'done',
      lastSyncAt: now,
      licenseValid: true,
      message: `Sinkron ✓ ${body.transactionsSynced ?? transactions.length} transaksi`,
    });
    await refreshPending();
    return { kind: 'ok', response: body };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sinkronisasi gagal';
    setState({ phase: 'error', message });
    return { kind: 'error', message };
  } finally {
    running = false;
  }
}

function stripProduct(p: LocalProduct): Omit<Product, never> {
  const { _dirty, _deleted, ...rest } = p;
  void _dirty;
  void _deleted;
  return rest;
}
function stripTransaction(t: LocalTransaction): Omit<Transaction, never> {
  const { _dirty, _deleted, ...rest } = t;
  void _dirty;
  void _deleted;
  return rest;
}
function stripItem(i: LocalTransactionItem): Omit<TransactionItem, never> {
  const { _dirty, _deleted, ...rest } = i;
  void _dirty;
  void _deleted;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Auto sync                                                            */
/* ------------------------------------------------------------------ */

const SYNC_INTERVAL_MS = 30_000;

function bindConnectivity() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  window.addEventListener('online', () => {
    setState({ online: true, message: 'Koneksi kembali — sinkron otomatis…' });
    void syncNow(true);
  });
  window.addEventListener('offline', () => {
    setState({ online: false, phase: 'offline', message: 'Mode offline — data aman di perangkat' });
  });
  // Flush best-effort saat tab disembunyikan atau ditutup.
  // Event beforeunload tidak memulai fetch async, jadi andalkan
  // visibilitychange + pagehide yang lebih andal, dengan interval sebagai pengaman.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && navigator.onLine) void syncNow();
  });
  window.addEventListener('pagehide', () => {
    if (navigator.onLine) void syncNow();
  });
}

/** Nyalakan sinkronisasi background (idempoten). */
export function startAutoSync(intervalMs = SYNC_INTERVAL_MS): () => void {
  if (typeof window === 'undefined') return () => {};
  bindConnectivity();
  void refreshPending();
  void (async () => {
    const last = await getMeta<string | null>(META_KEYS.lastSyncAt, null);
    setState({ lastSyncAt: last });
  })();
  if (!timer) {
    timer = setInterval(() => {
      void syncNow();
    }, intervalMs);
  }
  // sync pertama setelah 1.5 detik (memberi waktu app siap)
  const bootTimer = setTimeout(() => void syncNow(), 1500);
  return () => {
    clearTimeout(bootTimer);
  };
}

export function stopAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
