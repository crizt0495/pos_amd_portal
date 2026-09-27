'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Store,
  Users,
} from 'lucide-react';

import { ErrorBox, PageTitle } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import {
  createAdminPartner,
  fetchAdminPartners,
  patchAdminPartner,
  type AdminPartnerRow,
} from '@/lib/admin-data';
import { fmtDate, rupiah } from '@/lib/utils';
import { QUOTA_LOW_WARNING, TOPUP_AMOUNT } from '@/types';

const EMPTY_FORM = {
  email: '',
  password: '',
  namaToko: '',
  noHp: '',
  alamat: '',
  licenseQuota: '5',
  commissionRate: '10',
  notes: '',
};

export default function AdminPartnersPage() {
  const auth = useAuth();
  const toast = useToast();

  const [rows, setRows] = React.useState<AdminPartnerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = React.useState(false);

  const [edit, setEdit] = React.useState<AdminPartnerRow | null>(null);
  const [editForm, setEditForm] = React.useState({ namaToko: '', noHp: '', alamat: '', commissionRate: '10', notes: '' });
  const [editBusy, setEditBusy] = React.useState(false);

  const [topup, setTopup] = React.useState<AdminPartnerRow | null>(null);
  const [topupAmount, setTopupAmount] = React.useState(String(TOPUP_AMOUNT));
  const [topupBusy, setTopupBusy] = React.useState(false);

  const [confirmSuspend, setConfirmSuspend] = React.useState<AdminPartnerRow | null>(null);

  const focus = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('focus');
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminPartners());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar partner.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.nama_toko.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.no_hp ?? '').toLowerCase().includes(q) ||
        (p.alamat ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const stats = React.useMemo(() => {
    const active = rows.filter((p) => p.status === 'active').length;
    const low = rows.filter((p) => p.status === 'active' && p.license_quota <= QUOTA_LOW_WARNING).length;
    return {
      active,
      low,
      suspended: rows.length - active,
      quota: rows.reduce((a, p) => a + p.license_quota, 0),
      commission: rows.reduce((a, p) => a + p.commission, 0),
      revenue: rows.reduce((a, p) => a + p.revenue, 0),
    };
  }, [rows]);

  /* ------------------------------ actions -------------------------- */

  async function doAction(p: AdminPartnerRow, action: Parameters<typeof patchAdminPartner>[1]['action']) {
    setBusyId(p.id);
    try {
      const res = await patchAdminPartner(p.id, { action });
      toast.success('Berhasil', res.message);
      await refresh();
    } catch (e) {
      toast.error('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitCreate() {
    setFormBusy(true);
    try {
      const res = await createAdminPartner({
        email: form.email.trim(),
        password: form.password,
        namaToko: form.namaToko.trim(),
        noHp: form.noHp.trim(),
        alamat: form.alamat.trim(),
        licenseQuota: parseInt(form.licenseQuota, 10) || 5,
        commissionRate: parseFloat(form.commissionRate) || 10,
        notes: form.notes.trim(),
      });
      toast.success('Partner dibuat', res.message);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (e) {
      toast.error('Gagal membuat partner', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setFormBusy(false);
    }
  }

  function openEdit(p: AdminPartnerRow) {
    setEdit(p);
    setEditForm({
      namaToko: p.nama_toko,
      noHp: p.no_hp ?? '',
      alamat: p.alamat ?? '',
      commissionRate: String(p.commission_rate),
      notes: p.notes ?? '',
    });
  }

  async function submitEdit() {
    if (!edit) return;
    setEditBusy(true);
    try {
      const res = await patchAdminPartner(edit.id, {
        action: 'update',
        namaToko: editForm.namaToko.trim(),
        noHp: editForm.noHp.trim() || null,
        alamat: editForm.alamat.trim() || null,
        commissionRate: parseFloat(editForm.commissionRate) || 0,
        notes: editForm.notes.trim() || null,
      });
      toast.success('Tersimpan', res.message);
      setEdit(null);
      await refresh();
    } catch (e) {
      toast.error('Gagal menyimpan', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setEditBusy(false);
    }
  }

  async function submitTopup() {
    if (!topup) return;
    const amount = parseInt(topupAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Jumlah topup tidak valid');
      return;
    }
    setTopupBusy(true);
    try {
      const res = await patchAdminPartner(topup.id, { action: 'topup', amount });
      toast.success('Topup berhasil', res.message);
      setTopup(null);
      await refresh();
    } catch (e) {
      toast.error('Gagal topup', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setTopupBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageTitle
        title="Manajemen Partner"
        description="Kelola toko partner, kuota lisensi, dan status akun"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Muat Ulang
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Tambah Partner
            </Button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Partner" value={rows.length} icon={<Users className="h-5 w-5" />} />
        <StatCard
          label="Aktif"
          value={stats.active}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
          hint={`${stats.suspended} suspended`}
        />
        <StatCard
          label="Kuota Menipis"
          value={stats.low}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
          hint="Sisa ≤ 1 lisensi"
        />
        <StatCard
          label="Komisi Terutang"
          value={rupiah(stats.commission, { compact: true })}
          icon={<KeyRound className="h-5 w-5" />}
          tone="primary"
          hint={`Omzet total ${rupiah(stats.revenue, { compact: true })}`}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama toko, email, atau no HP…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-xl border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={rows.length === 0 ? 'Belum ada partner' : 'Tidak ada partner yang cocok'}
          description={
            rows.length === 0
              ? 'Tambahkan toko partner pertama. Akun login dibuat otomatis dengan kuota awal.'
              : 'Ubah kata kunci pencarian.'
          }
          action={
            rows.length === 0 ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Tambah Partner
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => {
            const quotaTotal = p.license_quota + p.license_granted;
            const used = quotaTotal - p.license_quota;
            const low = p.status === 'active' && p.license_quota <= QUOTA_LOW_WARNING;
            const isFocused = focus === p.id;
            return (
              <Card
                key={p.id}
                className={
                  isFocused
                    ? 'space-y-3 border-primary ring-2 ring-primary/30'
                    : 'space-y-3 transition-shadow hover:shadow-md'
                }
              >
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-semibold">
                        <Store className="h-4 w-4 shrink-0 text-primary" />
                        {p.nama_toko}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{p.email ?? 'Tanpa email'}</p>
                    </div>
                    <Badge variant={p.status === 'active' ? 'success' : 'destructive'} className="shrink-0">
                      {p.status === 'active' ? 'Aktif' : 'Suspended'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {p.no_hp && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {p.no_hp}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            void navigator.clipboard?.writeText(p.no_hp ?? '');
                            toast.success('No HP disalin');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </p>
                    )}
                    {p.alamat && (
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{p.alamat}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" /> Bergabung {fmtDate(p.created_at)}
                    </p>
                  </div>

                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sisa Kuota Lisensi</span>
                      <span className={`font-bold tnum ${low ? 'text-destructive' : 'text-success'}`}>
                        {p.license_quota}/{quotaTotal}
                      </span>
                    </div>
                    <Progress
                      value={quotaTotal > 0 ? (used / quotaTotal) * 100 : 0}
                      className="mt-2 h-2"
                      indicatorClassName={low ? 'bg-destructive' : 'bg-primary'}
                    />
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {used} lisensi terjual • komisi {p.commission_rate}% • sisa komisi{' '}
                      {rupiah(p.commission, { compact: true })}
                    </p>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <MiniStat label="Lisensi" value={p.licenses_total} />
                    <MiniStat label="Aktif" value={p.licenses_active} tone="text-success" />
                    <MiniStat label="Belum" value={p.licenses_unused} tone="text-warning" />
                    <MiniStat label="Blokir" value={p.licenses_blocked} tone="text-destructive" />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTopup(p);
                        setTopupAmount(String(TOPUP_AMOUNT));
                      }}
                      loading={busyId === p.id}
                    >
                      <KeyRound className="h-4 w-4" /> Topup
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" /> Ubah
                    </Button>
                    {p.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setConfirmSuspend(p)}
                      >
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => void doAction(p, 'activate')}
                        loading={busyId === p.id}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Aktifkan
                      </Button>
                    )}
                  </div>

                  {p.notes && (
                    <>
                      <Separator />
                      <p className="text-xs text-muted-foreground">Catatan: {p.notes}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* BUAT PARTNER */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Partner Baru</DialogTitle>
            <DialogDescription>
              Akun login dibuat otomatis di Supabase Auth. Pastikan password diberikan ke partner dan
              minta mereka menggantinya setelah login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama Toko" id="p-toko">
                <Input
                  id="p-toko"
                  value={form.namaToko}
                  onChange={(e) => setForm({ ...form, namaToko: e.target.value })}
                  placeholder="CV Mitra Komputer"
                />
              </Field>
              <Field label="Email Login" id="p-email">
                <Input
                  id="p-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="mitra@email.com"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Password sementara" id="p-pass">
                <Input
                  id="p-pass"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                />
              </Field>
              <Field label="No. HP" id="p-hp">
                <Input
                  id="p-hp"
                  value={form.noHp}
                  onChange={(e) => setForm({ ...form, noHp: e.target.value })}
                  placeholder="0812…"
                />
              </Field>
            </div>
            <Field label="Alamat" id="p-alamat">
              <Textarea
                id="p-alamat"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                placeholder="Alamat lengkap toko"
                rows={2}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kuota Lisensi" id="p-quota">
                <Input
                  id="p-quota"
                  type="number"
                  min={0}
                  value={form.licenseQuota}
                  onChange={(e) => setForm({ ...form, licenseQuota: e.target.value })}
                  className="tnum"
                />
              </Field>
              <Field label="Komisi (%)" id="p-rate">
                <Input
                  id="p-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={form.commissionRate}
                  onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                  className="tnum"
                />
              </Field>
            </div>
            <Field label="Catatan Internal" id="p-notes">
              <Textarea
                id="p-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="mis. Kontrak reseller,termin transfer, dll."
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={formBusy}>
              Batal
            </Button>
            <Button
              onClick={() => void submitCreate()}
              loading={formBusy}
              disabled={!form.namaToko.trim() || !form.email.trim() || form.password.length < 6}
            >
              <Plus className="h-4 w-4" /> Buat Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UBAH PARTNER */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ubah Data Partner</DialogTitle>
            <DialogDescription>{edit?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Nama Toko" id="e-toko">
              <Input
                id="e-toko"
                value={editForm.namaToko}
                onChange={(e) => setEditForm({ ...editForm, namaToko: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="No. HP" id="e-hp">
                <Input
                  id="e-hp"
                  value={editForm.noHp}
                  onChange={(e) => setEditForm({ ...editForm, noHp: e.target.value })}
                />
              </Field>
              <Field label="Komisi (%)" id="e-rate">
                <Input
                  id="e-rate"
                  type="number"
                  value={editForm.commissionRate}
                  onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })}
                  className="tnum"
                />
              </Field>
            </div>
            <Field label="Alamat" id="e-alamat">
              <Textarea
                id="e-alamat"
                value={editForm.alamat}
                onChange={(e) => setEditForm({ ...editForm, alamat: e.target.value })}
                rows={2}
              />
            </Field>
            <Field label="Catatan Internal" id="e-notes">
              <Textarea
                id="e-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={editBusy}>
              Batal
            </Button>
            <Button onClick={() => void submitEdit()} loading={editBusy}>
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TOPUP */}
      <Dialog open={!!topup} onOpenChange={(o) => !o && setTopup(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Topup Kuota Lisensi</DialogTitle>
            <DialogDescription>
              {topup?.nama_toko} — sisa {topup?.license_quota} dari{' '}
              {(topup?.license_quota ?? 0) + (topup?.license_granted ?? 0)} lisensi
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Jumlah lisensi" id="t-amount">
              <Input
                id="t-amount"
                type="number"
                min={1}
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value.replace(/[^\d]/g, ''))}
                className="tnum"
              />
            </Field>
            <div className="flex gap-2">
              {[1, 5, 10, 25].map((n) => (
                <Button
                  key={n}
                  size="xs"
                  variant="outline"
                  onClick={() => setTopupAmount(String((parseInt(topupAmount, 10) || 0) + n))}
                >
                  +{n}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Setelah topup:{' '}
              <span className="font-semibold text-foreground">
                {(topup?.license_quota ?? 0) + (parseInt(topupAmount, 10) || 0)} lisensi
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopup(null)} disabled={topupBusy}>
              Batal
            </Button>
            <Button onClick={() => void submitTopup()} loading={topupBusy}>
              <KeyRound className="h-4 w-4" /> Topup Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUSPEND */}
      <AlertDialog open={!!confirmSuspend} onOpenChange={(o) => !o && setConfirmSuspend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend partner {confirmSuspend?.nama_toko}?</AlertDialogTitle>
            <AlertDialogDescription>
              Partner tidak akan bisa membuat lisensi baru sampai diaktifkan kembali. Lisensi yang
              sudah terjual dan teraktivasi pada perangkat pembeli tidak terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmSuspend) void doAction(confirmSuspend, 'suspend');
                setConfirmSuspend(null);
              }}
            >
              Ya, Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tnum ${tone ?? ''}`}>{value}</p>
    </div>
  );
}
