'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  createNextAssignment,
  getAvailableWork,
  getMyWork,
  getIncomingTransfers,
  selectTransferProcesses,
  getOperators,
  recordProductionResult,
  completeProductionStep,
  completeProductionOrder,
  startOperatorWork,
  type OperatorUser,
  type OperatorWorkItem,
  type IncomingTransfer,
  type ProductionLot,
} from '@/lib/api/operatorWork';

type Tab = 'available' | 'mine';
type ResultForm = {
  inputLotId: string;
  processedQuantity: string;
  goodQuantity: string;
  scrapQuantity: string;
  notes: string;
};
type TransferForm = {
  sourceLotId: string;
  quantity: string;
  notes: string;
};

const emptyResult: ResultForm = {
  inputLotId: '',
  processedQuantity: '',
  goodQuantity: '',
  scrapQuantity: '',
  notes: '',
};
const emptyTransfer: TransferForm = {
  sourceLotId: '',
  quantity: '',
  notes: '',
};
const fieldClass =
  'mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';
const labelClass = 'block min-w-0 text-sm font-semibold text-slate-700';
const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50';

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}
function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan. Silakan coba lagi.';
}
function processName(step: OperatorWorkItem['step']) {
  return (
    step.processName ||
    step.processCode ||
    step.process ||
    `Proses ${step.sequence ?? ''}`
  );
}
function productName(work: OperatorWorkItem) {
  return typeof work.order.product === 'object'
    ? work.order.product?.name || 'Produk'
    : work.order.product || 'Produk';
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: 'Direncanakan',
    in_progress: 'Sedang berjalan',
    partially_completed: 'Selesai sebagian',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
  };
  return labels[status] || status;
}
function statusClass(status: string) {
  if (status === 'completed')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'in_progress')
    return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'cancelled') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'partially_completed')
    return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}
function lotLabel(lot: ProductionLot) {
  return `${lot.lotCode} · tersedia ${formatNumber(lot.availableQuantity)} unit`;
}
function Notice({
  type,
  children,
  onClose,
}: {
  type: 'error' | 'success';
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      <div className="min-w-0 break-words">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup pesan"
        className="shrink-0 rounded-lg px-2 text-lg leading-5 opacity-70 hover:bg-black/5"
      >
        ×
      </button>
    </div>
  );
}
function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'blue' | 'amber' | 'green';
}) {
  const tones = {
    red: 'bg-red-50 text-red-700 ring-red-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p
        className={`mt-2 inline-flex rounded-xl px-3 py-1.5 text-2xl font-bold tabular-nums ring-1 ${tones[tone]}`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

export default function OperatorPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<Tab>('available');
  const [available, setAvailable] = useState<OperatorWorkItem[]>([]);
  const [mine, setMine] = useState<OperatorWorkItem[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<
    IncomingTransfer[]
  >([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<
    Record<string, string[]>
  >({});
  // Checklist untuk memilih beberapa proses tersedia sebelum mulai bekerja.
  const [selectedAvailableKeys, setSelectedAvailableKeys] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedWork, setSelectedWork] = useState<OperatorWorkItem | null>(
    null,
  );
  const [resultForm, setResultForm] = useState<ResultForm>(emptyResult);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransfer);
  const [formMode, setFormMode] = useState<'result' | 'transfer' | null>(null);

  const loadWork = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [availableData, mineData, incomingData] = await Promise.all([
        getAvailableWork(),
        getMyWork(),
        getIncomingTransfers(),
      ]);
      setAvailable(availableData);
      setMine(mineData);
      setIncomingTransfers(incomingData);
      const availableKeys = new Set(
        availableData
          .filter(
            (work) =>
              work.step.ownerOperator == null &&
              !['completed', 'cancelled'].includes(work.step.status),
          )
          .map((work) => `${work.order._id}:${work.step._id}`),
      );
      setSelectedAvailableKeys((current) =>
        current.filter((key) => availableKeys.has(key)),
      );
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [availableData, mineData, operatorData, incomingData] =
          await Promise.all([
            getAvailableWork(),
            getMyWork(),
            getOperators(),
            getIncomingTransfers(),
          ]);
        if (cancelled) return;
        setAvailable(availableData);
        setMine(mineData);
        setOperators(operatorData);
        setIncomingTransfers(incomingData);
        const selectableKeys = new Set(
          availableData
            .filter(
              (work) =>
                work.step.ownerOperator == null &&
                !['completed', 'cancelled'].includes(work.step.status),
            )
            .map((work) => `${work.order._id}:${work.step._id}`),
        );
        setSelectedAvailableKeys((current) =>
          current.filter((key) => selectableKeys.has(key)),
        );
        setError('');
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      if (!cancelled) {
        setRefreshing(true);
        void refresh();
      }
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const summary = useMemo(
    () => ({
      available: available.filter(
        (item) =>
          item.step.ownerOperator == null &&
          !['completed', 'cancelled'].includes(item.step.status),
      ).length,
      mine: mine.length,
      running: mine.filter((item) => item.step.status === 'in_progress').length,
      completed: mine.filter((item) => item.step.status === 'completed').length,
    }),
    [available, mine],
  );
  const currentList = tab === 'available' ? available : mine;
  const selectedAvailableWorks = available.filter(
    (work) =>
      work.step.ownerOperator == null &&
      !['completed', 'cancelled'].includes(work.step.status) &&
      selectedAvailableKeys.includes(`${work.order._id}:${work.step._id}`),
  );
  const availableGroups = useMemo(() => {
    const groups = new Map<
      string,
      { order: OperatorWorkItem['order']; items: OperatorWorkItem[] }
    >();
    for (const work of available) {
      const key = work.order._id;
      const group = groups.get(key);
      if (group) group.items.push(work);
      else groups.set(key, { order: work.order, items: [work] });
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) => Number(a.step.sequence ?? 0) - Number(b.step.sequence ?? 0),
      ),
    }));
  }, [available]);

  const selectedInputLots = (selectedWork?.inputLots ?? []).filter(
    (lot) => lot.availableQuantity > 0,
  );
  const selectedInputLot =
    selectedInputLots.find((lot) => lot._id === resultForm.inputLotId) ??
    selectedInputLots[0];
  const totalAvailableInputQuantity = selectedInputLots.reduce(
    (total, lot) => total + Math.max(0, Number(lot.availableQuantity) || 0),
    0,
  );
  const enteredProcessedQuantity = Number(resultForm.processedQuantity);
  // Selesai proses hanya boleh dipilih ketika pencatatan ini menghabiskan
  // seluruh input aktif untuk step tersebut. Hasil parsial tetap memakai Simpan hasil.
  const canCompleteStepWithCurrentEntry = Boolean(
    selectedInputLot &&
    Number.isSafeInteger(enteredProcessedQuantity) &&
    enteredProcessedQuantity > 0 &&
    enteredProcessedQuantity === Number(selectedInputLot.availableQuantity) &&
    enteredProcessedQuantity === totalAvailableInputQuantity,
  );
  // Transfer hanya boleh mengambil lot hasil baik dari proses ini, bukan lot input.
  const selectedOutputLots = (selectedWork?.outputLots ?? []).filter(
    (lot, index, all) =>
      lot.availableQuantity > 0 &&
      all.findIndex((item) => item._id === lot._id) === index,
  );
  const selectedOutputLot =
    selectedOutputLots.find((lot) => lot._id === transferForm.sourceLotId) ??
    selectedOutputLots[0];

  async function handleStartSelected() {
    const selectedWorks = selectedAvailableWorks;
    if (selectedWorks.length === 0) {
      setError('Centang minimal satu proses yang ingin kamu ambil.');
      return;
    }

    setBusyKey('claim-selected-processes');
    setError('');
    setNotice('');
    const started: string[] = [];
    try {
      // Setiap proses diklaim lewat endpoint yang sama dengan klaim tunggal.
      // Backend tetap memvalidasi kepemilikan, dependensi, dan stok secara atomik.
      for (const work of selectedWorks) {
        await startOperatorWork(work.order._id, work.step._id);
        started.push(`${work.order.orderNumber} · ${processName(work.step)}`);
      }
      setSelectedAvailableKeys([]);
      setNotice(
        `Berhasil mengambil ${started.length} proses: ${started.join('; ')}.`,
      );
      await loadWork(true);
      setTab('mine');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(
        started.length > 0
          ? `Sebagian proses berhasil diklaim (${started.length}): ${started.join('; ')}. Proses berikutnya gagal: ${message}. Data sudah dimuat ulang.`
          : message,
      );
      setSelectedAvailableKeys([]);
      await loadWork(true);
    } finally {
      setBusyKey('');
    }
  }

  function openResult(work: OperatorWorkItem) {
    const lots = work.inputLots ?? [];
    setSelectedWork(work);
    setFormMode('result');
    setResultForm({
      ...emptyResult,
      inputLotId: lots[0]?._id ?? '',
      processedQuantity: '',
      goodQuantity: '',
      scrapQuantity: '',
    });
    setTransferForm(emptyTransfer);
    setError('');
    setNotice('');
  }

  function openTransfer(work: OperatorWorkItem) {
    const lots = (work.outputLots ?? []).filter(
      (lot, index, all) =>
        lot.availableQuantity > 0 &&
        all.findIndex((item) => item._id === lot._id) === index,
    );
    setSelectedWork(work);
    setFormMode('transfer');
    setTransferForm({
      ...emptyTransfer,
      sourceLotId: lots[0]?._id ?? '',
      quantity: lots[0] ? String(lots[0].availableQuantity) : '',
    });
    setSelectedOperatorIds([]);
    setResultForm(emptyResult);
    setError('');
    setNotice('');
  }

  async function handleRecordResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWork) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const completeStep = submitter?.value === 'complete-step';
    const processedQuantity = Number(resultForm.processedQuantity);
    const goodQuantity = Number(resultForm.goodQuantity);
    const scrapQuantity = Number(resultForm.scrapQuantity);
    const inputLot =
      selectedInputLots.find((lot) => lot._id === resultForm.inputLotId) ??
      selectedInputLots[0];
    if (!inputLot)
      return setError(
        'Tidak ada lot input aktif yang tersedia. Jika proses telanjur berstatus selesai, stok input yang tersisa akan membuka pencatatan lanjutan.',
      );
    if (!Number.isSafeInteger(processedQuantity) || processedQuantity < 1)
      return setError('Jumlah diproses harus bilangan bulat minimal 1.');
    if (
      !Number.isSafeInteger(goodQuantity) ||
      goodQuantity < 0 ||
      !Number.isSafeInteger(scrapQuantity) ||
      scrapQuantity < 0
    )
      return setError(
        'Jumlah baik dan rusak harus berupa bilangan bulat nol atau lebih.',
      );
    if (goodQuantity + scrapQuantity !== processedQuantity)
      return setError(
        'Jumlah produk baik + rusak harus sama dengan jumlah diproses.',
      );
    if (processedQuantity > inputLot.availableQuantity)
      return setError(
        `Jumlah diproses melebihi stok lot terpilih (${formatNumber(inputLot.availableQuantity)} unit).`,
      );
    if (completeStep && !canCompleteStepWithCurrentEntry)
      return setError(
        `Proses belum bisa diselesaikan. Total input aktif yang tersisa ${formatNumber(totalAvailableInputQuantity)} unit. Jika baru mengerjakan sebagian, klik Simpan hasil terlebih dahulu. Catat sisa input pada pencatatan berikutnya, lalu pilih Selesai proses ketika semua input sudah diproses.`,
      );

    const key = `${selectedWork.order._id}:${selectedWork.step._id}:result`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await recordProductionResult(
        selectedWork.order._id,
        selectedWork.step._id,
        {
          idempotencyKey: crypto.randomUUID(),
          notes: resultForm.notes,
          completeStep,
          allocations: [
            {
              inputLot: inputLot._id,
              quantityProcessed: processedQuantity,
              goodQuantity,
              scrapQuantity,
            },
          ],
        },
      );
      setNotice(
        `Hasil tersimpan: ${formatNumber(processedQuantity)} diproses, ${formatNumber(goodQuantity)} baik, ${formatNumber(scrapQuantity)} rusak${completeStep ? '. Proses ditandai selesai.' : '. Proses masih dapat menerima pencatatan hasil berikutnya.'}`,
      );
      setSelectedWork(null);
      setFormMode(null);
      setResultForm(emptyResult);
      await loadWork(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyKey('');
    }
  }

  async function handleCompleteStepWithoutResult(work: OperatorWorkItem) {
    if (work.step.status === 'completed') return;
    const hasRemainingInput = (work.inputLots ?? []).some(
      (lot) => Number(lot.availableQuantity) > 0,
    );
    if (hasRemainingInput) {
      setError(
        'Masih ada input yang tersedia. Catat sisa input sebelum menyelesaikan proses.',
      );
      return;
    }
    if (Number(work.step.quantityProcessed ?? 0) <= 0) {
      setError(
        'Proses belum memiliki hasil produksi. Catat hasil terlebih dahulu.',
      );
      return;
    }
    const confirmed = window.confirm(
      `Tandai proses ${processName(work.step)} pada ${work.order.orderNumber} selesai tanpa mencatat hasil baru?`,
    );
    if (!confirmed) return;
    const key = `complete-step:${work.order._id}:${work.step._id}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await completeProductionStep(work.order._id, work.step._id);
      setNotice(
        `Proses ${processName(work.step)} selesai. Tidak ada hasil atau lot baru yang dibuat.`,
      );
      setSelectedWork(null);
      setFormMode(null);
      await loadWork(true);
    } catch (err) {
      setError(getErrorMessage(err));
      await loadWork(true);
    } finally {
      setBusyKey('');
    }
  }

  async function handleCompleteProduction(work: OperatorWorkItem) {
    const steps = work.order.steps ?? [];
    const allStepsTerminal =
      steps.length > 0 &&
      steps.every((step) => ['completed', 'cancelled'].includes(step.status));
    if (!allStepsTerminal) {
      setError('Selesaikan semua proses wajib sebelum menyelesaikan produksi.');
      return;
    }
    if (work.order.status === 'completed') {
      setNotice('Production Order ini sudah selesai.');
      return;
    }
    const confirmed = window.confirm(
      `Selesaikan produksi ${work.order.orderNumber} dan masukkan barang baik ke inventori?`,
    );
    if (!confirmed) return;
    const key = `complete-production:${work.order._id}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await completeProductionOrder(work.order._id, work.step._id);
      setNotice(
        `Produksi ${work.order.orderNumber} selesai. Barang baik sudah diproses untuk masuk inventori.`,
      );
      await loadWork(true);
    } catch (err) {
      setError(getErrorMessage(err));
      await loadWork(true);
    } finally {
      setBusyKey('');
    }
  }

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWork) return;
    const sourceLot =
      selectedOutputLots.find((lot) => lot._id === transferForm.sourceLotId) ??
      selectedOutputLots[0];
    const quantity = Number(transferForm.quantity);
    if (!sourceLot)
      return setError(
        'Tidak ada lot hasil aktif yang dapat diserahkan. Catat hasil produksi terlebih dahulu.',
      );
    const recipientIds = [...new Set(selectedOperatorIds)];
    if (recipientIds.length === 0)
      return setError('Pilih minimal satu Operator penerima.');
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      return setError('Jumlah transfer harus bilangan bulat minimal 1.');
    if (quantity < recipientIds.length)
      return setError(
        `Jumlah transfer minimal ${recipientIds.length} unit karena setiap operator harus menerima minimal 1 unit.`,
      );
    if (quantity > sourceLot.availableQuantity)
      return setError(
        `Jumlah transfer melebihi stok lot (${formatNumber(sourceLot.availableQuantity)} unit).`,
      );
    const key = `${selectedWork.order._id}:${selectedWork.step._id}:transfer`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await createNextAssignment(
        selectedWork.order._id,
        selectedWork.step._id,
        {
          targetOperatorIds: recipientIds,
          sourceLotId: sourceLot._id,
          quantity,
          idempotencyKey: crypto.randomUUID(),
          notes: transferForm.notes,
        },
      );
      setNotice(
        `Transfer total ${formatNumber(quantity)} unit berhasil dibagi ke ${recipientIds.length} operator. Setiap operator menerima bagian kuantitasnya dan memilih proses tujuan sendiri.`,
      );
      setSelectedWork(null);
      setFormMode(null);
      setTransferForm(emptyTransfer);
      setSelectedOperatorIds([]);
      await loadWork(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyKey('');
    }
  }

  async function handleSelectTransferProcesses(transfer: IncomingTransfer) {
    const stepIds = selectedProcessIds[transfer.transfer._id] ?? [];
    if (stepIds.length === 0) {
      setError('Pilih minimal satu proses sebelum melanjutkan.');
      return;
    }
    const key = `select-transfer:${transfer.transfer._id}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await selectTransferProcesses(transfer.transfer._id, stepIds);
      setNotice(
        `${formatNumber(transfer.transfer.quantity)} unit berhasil ditautkan ke ${stepIds.length} proses pilihan.`,
      );
      setSelectedProcessIds((current) => ({
        ...current,
        [transfer.transfer._id]: [],
      }));
      await loadWork(true);
    } catch (err) {
      setError(getErrorMessage(err));
      await loadWork(true);
    } finally {
      setBusyKey('');
    }
  }

  if (user && user.role !== 'operator') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 text-slate-800">
        <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex size-12 items-center justify-center rounded-xl bg-red-50 text-xl font-bold text-red-600">
            !
          </div>
          <h1 className="mt-4 text-xl font-bold">Akses ditolak</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Halaman ini hanya tersedia untuk akun Operator.
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className={`${primaryButtonClass} mt-5 w-full`}
          >
            Kembali ke Dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-800">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
              Fahrul Store · Produksi
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Workspace Operator
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Mulai proses, catat kuantitas hasil, dan serahkan lot baik ke
              proses berikutnya tanpa memasukkan ID secara manual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWork(true)}
            disabled={refreshing}
            className={secondaryButtonClass}
          >
            {refreshing ? 'Memuat...' : 'Refresh data'}
          </button>
        </section>

        {error && (
          <Notice type="error" onClose={() => setError('')}>
            {error}
          </Notice>
        )}
        {notice && (
          <Notice type="success" onClose={() => setNotice('')}>
            {notice}
          </Notice>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Pekerjaan tersedia"
            value={summary.available}
            tone="blue"
          />
          <StatCard label="Proses milik saya" value={summary.mine} tone="red" />
          <StatCard
            label="Sedang berjalan"
            value={summary.running}
            tone="amber"
          />
          <StatCard label="Selesai" value={summary.completed} tone="green" />
        </section>

        {incomingTransfers.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">
                Transfer masuk
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900">
                Pilih proses yang akan dikerjakan
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Jumlah transfer adalah kuantitas unit, bukan rentang unit. Pilih
                satu atau beberapa proses yang tersedia.
              </p>
            </div>
            <div className="space-y-4">
              {incomingTransfers.map((item) => {
                const transferId = item.transfer._id;
                const selected = selectedProcessIds[transferId] ?? [];
                return (
                  <article
                    key={transferId}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900">
                          {item.order.orderNumber}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Dari proses:{' '}
                          {item.sourceStep?.processName ||
                            item.sourceStep?.processCode ||
                            item.sourceStep?.process ||
                            'Proses sumber'}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Kuantitas transfer:{' '}
                          <strong className="text-red-700">
                            {formatNumber(item.transfer.quantity)} unit
                          </strong>
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        Menunggu pilihan proses
                      </span>
                    </div>
                    {item.eligibleSteps.length === 0 ? (
                      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                        Belum ada proses yang dependensinya terpenuhi atau semua
                        proses yang sesuai sudah diklaim.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-semibold text-slate-700">
                          Checklist proses
                        </p>
                        {item.eligibleSteps.map((step) => (
                          <label
                            key={step._id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50/40"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(step._id)}
                              disabled={Boolean(busyKey)}
                              onChange={(event) =>
                                setSelectedProcessIds((current) => {
                                  const currentIds = current[transferId] ?? [];
                                  return {
                                    ...current,
                                    [transferId]: event.target.checked
                                      ? [...currentIds, step._id]
                                      : currentIds.filter(
                                          (id) => id !== step._id,
                                        ),
                                  };
                                })
                              }
                              className="mt-1 size-4 accent-red-600"
                            />
                            <span>
                              <strong className="block text-sm text-slate-900">
                                #{step.sequence ?? '-'} ·{' '}
                                {step.processName ||
                                  step.processCode ||
                                  step.process ||
                                  'Proses'}
                              </strong>
                              <span className="mt-1 block text-xs text-slate-500">
                                Status: {statusLabel(step.status)}
                              </span>
                            </span>
                          </label>
                        ))}
                        <button
                          type="button"
                          disabled={Boolean(busyKey) || selected.length === 0}
                          onClick={() =>
                            void handleSelectTransferProcesses(item)
                          }
                          className={`${primaryButtonClass} mt-2`}
                        >
                          {busyKey === `select-transfer:${transferId}`
                            ? 'Menyimpan pilihan...'
                            : `Pilih ${selected.length} proses`}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Aktivitas produksi
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pekerjaan yang sudah dikunci hanya bisa dikerjakan oleh pemilik
                proses.
              </p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('available')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'available' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
              >
                Tersedia ({summary.available})
              </button>
              <button
                type="button"
                onClick={() => setTab('mine')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'mine' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}
              >
                Pekerjaan saya ({summary.mine})
              </button>
            </div>
          </div>

          {tab === 'available' && !loading && available.length > 0 && (
            <div className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="font-bold text-slate-900">Checklist proses</p>
                <p className="mt-1 text-sm text-slate-600">
                  Centang satu atau beberapa proses yang tersedia. Proses yang
                  berhasil diambil menjadi tanggung jawab akunmu dan tidak dapat
                  diklaim operator lain.
                </p>
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  {selectedAvailableWorks.length} proses dipilih
                </p>
              </div>
              <button
                type="button"
                disabled={
                  Boolean(busyKey) || selectedAvailableWorks.length === 0
                }
                onClick={() => void handleStartSelected()}
                className={primaryButtonClass}
              >
                {busyKey === 'claim-selected-processes'
                  ? 'Mengambil proses...'
                  : `Ambil ${selectedAvailableWorks.length} proses`}
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Memuat pekerjaan Operator...
            </div>
          ) : currentList.length === 0 ? (
            <div className="p-8 text-center sm:p-12">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">
                ✓
              </div>
              <h3 className="mt-4 font-bold text-slate-900">
                {tab === 'available'
                  ? 'Tidak ada pekerjaan tersedia'
                  : 'Belum ada proses milikmu'}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {tab === 'available'
                  ? 'Pekerjaan muncul saat Production Order ditugaskan kepadamu. Proses bisa diambil sebelum lot input tersedia.'
                  : 'Mulai pekerjaan dari tab Tersedia untuk mengunci proses ke akunmu.'}
              </p>
              <button
                type="button"
                onClick={() => void loadWork(true)}
                className={`${secondaryButtonClass} mt-5`}
              >
                Periksa lagi
              </button>
            </div>
          ) : tab === 'available' ? (
            <div className="space-y-4 p-4">
              {availableGroups.map((group) => (
                <article
                  key={group.order._id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <div className="border-b border-blue-100 bg-blue-50/70 p-4 sm:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
                      Produk / Production Order
                    </p>
                    <div className="mt-1 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="break-words text-lg font-extrabold text-slate-900">
                          {group.order.orderNumber}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {typeof group.order.product === 'object'
                            ? group.order.product?.name || 'Produk'
                            : group.order.product || 'Produk'}
                        </p>
                      </div>
                      <span className="inline-flex w-fit rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                        Target {formatNumber(group.order.quantity)} unit
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Pilih satu atau beberapa proses dari alur produk ini.
                      Proses dapat diambil lebih awal; pencatatan hasil baru
                      bisa dilakukan saat lot input tersedia. Proses yang sudah
                      diambil operator lain atau selesai tidak dapat dipilih.
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((work) => {
                      const key = `${work.order._id}:${work.step._id}`;
                      const selectable =
                        work.step.ownerOperator == null &&
                        !['completed', 'cancelled'].includes(work.step.status);
                      const selected = selectedAvailableKeys.includes(key);
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-3 p-4 sm:gap-4 sm:px-5 ${selectable ? 'cursor-pointer hover:bg-blue-50/40' : 'cursor-not-allowed bg-slate-50/70'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!selectable || Boolean(busyKey)}
                            onChange={(event) =>
                              setSelectedAvailableKeys((current) =>
                                event.target.checked
                                  ? [
                                      ...current.filter(
                                        (itemKey) => itemKey !== key,
                                      ),
                                      key,
                                    ]
                                  : current.filter(
                                      (itemKey) => itemKey !== key,
                                    ),
                              )
                            }
                            className="mt-1 size-4 shrink-0 accent-red-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                #{work.step.sequence ?? '-'}
                              </span>
                              <span className="font-bold text-slate-900">
                                {processName(work.step)}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass(work.step.status)}`}
                              >
                                {statusLabel(work.step.status)}
                              </span>
                            </div>
                            <p
                              className={`mt-1 text-sm ${selectable ? 'text-emerald-700' : 'text-slate-500'}`}
                            >
                              {selectable
                                ? work.availableQuantity > 0
                                  ? `Bisa diambil · Input tersedia: ${formatNumber(work.availableQuantity)} unit`
                                  : 'Bisa diambil lebih awal · Menunggu lot input tersedia'
                                : work.step.ownerOperator
                                  ? 'Proses sudah dimiliki operator.'
                                  : work.step.status === 'completed'
                                    ? 'Proses sudah selesai.'
                                    : work.step.status === 'cancelled'
                                      ? 'Proses dibatalkan.'
                                      : work.blockedReason ||
                                        'Belum bisa diambil.'}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              {currentList.map((work) => {
                const key = `${work.order._id}:${work.step._id}`;
                const busy = busyKey === key;
                const hasRemainingInput = (work.inputLots ?? []).some(
                  (lot) => lot.availableQuantity > 0,
                );
                // Koreksi tampilan data lama: completed + stok input tersisa
                // berarti proses masih perlu dilanjutkan, bukan benar-benar selesai.
                const displayStatus =
                  work.step.status === 'completed' && hasRemainingInput
                    ? 'partially_completed'
                    : work.step.status;
                const canRecordResult =
                  work.step.status !== 'cancelled' &&
                  (work.step.status !== 'completed' || hasRemainingInput);
                return (
                  <article
                    key={key}
                    className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:shadow-sm sm:p-5"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Production Order
                        </p>
                        <h3 className="mt-1 break-words text-lg font-extrabold text-slate-900">
                          {work.order.orderNumber}
                        </h3>
                        <p className="mt-1 break-words text-sm text-slate-500">
                          {productName(work)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(displayStatus)}`}
                      >
                        {statusLabel(displayStatus)}
                      </span>
                    </div>
                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                        Proses produksi · Urutan {work.step.sequence ?? '-'}
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {processName(work.step)}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-blue-100 pt-3 text-sm">
                        <div>
                          <p className="text-slate-500">Jumlah order</p>
                          <p className="mt-1 font-bold text-slate-900">
                            {formatNumber(work.order.quantity)} unit
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Lot input tersedia</p>
                          <p className="mt-1 font-bold text-emerald-700">
                            {formatNumber(work.availableQuantity)} unit
                          </p>
                        </div>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-xs text-slate-500">Diproses</dt>
                        <dd className="mt-1 font-bold">
                          {formatNumber(work.step.quantityProcessed ?? 0)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-3">
                        <dt className="text-xs text-emerald-700">Baik</dt>
                        <dd className="mt-1 font-bold text-emerald-800">
                          {formatNumber(work.step.quantityGood ?? 0)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-red-50 p-3">
                        <dt className="text-xs text-red-700">Rusak</dt>
                        <dd className="mt-1 font-bold text-red-800">
                          {formatNumber(work.step.quantityScrap ?? 0)}
                        </dd>
                      </div>
                    </dl>
                    {(work.inputLots?.length ?? 0) > 0 && (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Lot input:{' '}
                        {work.inputLots
                          .filter((lot) => lot.availableQuantity > 0)
                          .map(
                            (lot) =>
                              `${lot.lotCode} (${formatNumber(lot.availableQuantity)})`,
                          )
                          .join(', ') || 'Tidak ada stok tersisa'}
                      </p>
                    )}
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {tab === 'mine' && canRecordResult && (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => openResult(work)}
                          className={`${primaryButtonClass} bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/20`}
                        >
                          Catat hasil
                        </button>
                      )}
                      {tab === 'mine' &&
                        work.step.status !== 'cancelled' &&
                        (work.outputLots ?? []).some(
                          (lot) => lot.availableQuantity > 0,
                        ) && (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => openTransfer(work)}
                            className={secondaryButtonClass}
                          >
                            Transfer ke proses berikutnya
                          </button>
                        )}
                      {tab === 'mine' &&
                        ['in_progress', 'partially_completed'].includes(
                          work.step.status,
                        ) &&
                        !hasRemainingInput &&
                        Number(work.step.quantityProcessed ?? 0) > 0 && (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() =>
                              void handleCompleteStepWithoutResult(work)
                            }
                            className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500/20`}
                            title="Aktif karena semua input proses sudah habis dan hasil produksi sudah tercatat"
                          >
                            {busyKey ===
                            `complete-step:${work.order._id}:${work.step._id}`
                              ? 'Menyelesaikan proses...'
                              : 'Selesaikan proses'}
                          </button>
                        )}
                      {tab === 'mine' &&
                        work.step.status === 'completed' &&
                        !hasRemainingInput && (
                          <span className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                            Proses selesai
                          </span>
                        )}
                      {tab === 'mine' && work.step.status !== 'cancelled' && (
                        <button
                          type="button"
                          disabled={
                            Boolean(busyKey) ||
                            work.order.status === 'completed' ||
                            (work.step.status === 'completed' &&
                              hasRemainingInput) ||
                            !(work.order.steps ?? []).length ||
                            !(work.order.steps ?? []).every((step) =>
                              ['completed', 'cancelled'].includes(step.status),
                            )
                          }
                          onClick={() => void handleCompleteProduction(work)}
                          className={`${secondaryButtonClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}
                          title={
                            work.order.status === 'completed'
                              ? 'Production Order sudah selesai'
                              : 'Aktif setelah semua proses selesai atau dibatalkan'
                          }
                        >
                          {work.order.status === 'completed'
                            ? 'Produksi selesai'
                            : busyKey ===
                                `complete-production:${work.order._id}`
                              ? 'Menyelesaikan produksi...'
                              : 'Selesai produksi'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {selectedWork && formMode === 'result' && (
          <section className="scroll-mt-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
                  Pencatatan hasil produksi
                </p>
                <h2 className="mt-1 break-words text-xl font-extrabold text-slate-900">
                  {selectedWork.order.orderNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {processName(selectedWork.step)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedWork(null);
                  setFormMode(null);
                }}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
            <form onSubmit={handleRecordResult} className="mt-5 space-y-4">
              <label className={labelClass}>
                Lot input yang diproses
                <select
                  required
                  value={resultForm.inputLotId || selectedInputLot?._id || ''}
                  onChange={(event) =>
                    setResultForm((current) => ({
                      ...current,
                      inputLotId: event.target.value,
                    }))
                  }
                  className={fieldClass}
                >
                  {selectedInputLots
                    .filter((lot) => lot.availableQuantity > 0)
                    .map((lot) => (
                      <option key={lot._id} value={lot._id}>
                        {lotLabel(lot)}
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Pilih satu lot per pencatatan. Jika input berasal dari
                  beberapa lot, catat masing-masing lot secara terpisah.
                </span>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className={labelClass}>
                  Jumlah diproses
                  <input
                    required
                    type="number"
                    min={1}
                    max={selectedInputLot?.availableQuantity ?? 0}
                    step={1}
                    inputMode="numeric"
                    value={resultForm.processedQuantity}
                    onChange={(event) =>
                      setResultForm((current) => ({
                        ...current,
                        processedQuantity: event.target.value,
                      }))
                    }
                    placeholder="Contoh: 50"
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Produk baik
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={resultForm.goodQuantity}
                    onChange={(event) =>
                      setResultForm((current) => ({
                        ...current,
                        goodQuantity: event.target.value,
                      }))
                    }
                    placeholder="Contoh: 47"
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Produk rusak
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={resultForm.scrapQuantity}
                    onChange={(event) =>
                      setResultForm((current) => ({
                        ...current,
                        scrapQuantity: event.target.value,
                      }))
                    }
                    placeholder="Contoh: 3"
                    className={fieldClass}
                  />
                </label>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Jumlah baik + rusak harus sama dengan jumlah diproses. Stok lot
                input dikurangi secara transaksional oleh backend.
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                Gunakan <strong>Simpan hasil</strong> untuk pencatatan parsial;
                hasil akan tersimpan dan sisa input tetap bisa diproses nanti.
                Gunakan <strong>Selesai proses</strong> hanya saat pencatatan
                ini menghabiskan seluruh input aktif yang tersisa. Jika masih
                ada input, tombol penyelesaian akan tetap nonaktif.
              </p>
              {selectedInputLot && !canCompleteStepWithCurrentEntry && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
                  Input aktif tersisa{' '}
                  {formatNumber(totalAvailableInputQuantity)}
                  unit. Untuk menyelesaikan proses, catat semua sisa input
                  terlebih dahulu. Untuk jumlah parsial, klik Simpan hasil.
                </p>
              )}
              <label className={labelClass}>
                Catatan{' '}
                <span className="font-normal text-slate-400">(opsional)</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={resultForm.notes}
                  onChange={(event) =>
                    setResultForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Catatan hasil proses..."
                  className={`${fieldClass} resize-y`}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="submit"
                  name="action"
                  value="save-result"
                  disabled={Boolean(busyKey) || !selectedInputLot}
                  className={`${secondaryButtonClass} border-blue-200 text-blue-700 hover:bg-blue-50`}
                >
                  {busyKey ? 'Menyimpan...' : 'Simpan hasil'}
                </button>
                {selectedInputLot ? (
                  <button
                    type="submit"
                    name="action"
                    value="complete-step"
                    disabled={
                      Boolean(busyKey) || !canCompleteStepWithCurrentEntry
                    }
                    className={primaryButtonClass}
                  >
                    {busyKey ? 'Menyimpan...' : 'Selesai proses'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={
                      Boolean(busyKey) ||
                      Number(selectedWork.step.quantityProcessed ?? 0) <= 0 ||
                      selectedWork.step.status === 'completed' ||
                      selectedWork.step.status === 'cancelled'
                    }
                    onClick={() =>
                      void handleCompleteStepWithoutResult(selectedWork)
                    }
                    className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500/20`}
                    title="Menandai proses selesai tanpa membuat catatan hasil baru"
                  >
                    {busyKey ? 'Menyelesaikan proses...' : 'Selesaikan proses'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setSelectedWork(null);
                    setFormMode(null);
                  }}
                  className={secondaryButtonClass}
                >
                  Batal
                </button>
              </div>
            </form>
          </section>
        )}

        {selectedWork && formMode === 'transfer' && (
          <section className="scroll-mt-4 rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-red-700">
                  Transfer kuantitas ke proses berikutnya
                </p>
                <h2 className="mt-1 break-words text-xl font-extrabold text-slate-900">
                  {selectedWork.order.orderNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Dari proses: {processName(selectedWork.step)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedWork(null);
                  setFormMode(null);
                }}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Transfer hanya mengambil lot hasil baik yang sudah tercatat. Lot
              input/bahan yang belum diproses tidak dapat ditransfer. Pilih
              Operator penerima; operator penerima akan memilih proses tujuan
              setelah transfer masuk. Kuantitas lot sumber langsung dikurangi
              agar tidak dapat digunakan dua kali.
            </p>
            <form onSubmit={handleTransfer} className="mt-5 space-y-4">
              <label className={labelClass}>
                Lot sumber yang tersedia
                <select
                  required
                  value={
                    transferForm.sourceLotId || selectedOutputLot?._id || ''
                  }
                  onChange={(event) => {
                    const lot = selectedOutputLots.find(
                      (item) => item._id === event.target.value,
                    );
                    setTransferForm((current) => ({
                      ...current,
                      sourceLotId: event.target.value,
                      quantity: lot
                        ? String(
                            Math.min(
                              Number(current.quantity) || lot.availableQuantity,
                              lot.availableQuantity,
                            ),
                          )
                        : '',
                    }));
                  }}
                  className={fieldClass}
                >
                  {selectedOutputLots.map((lot) => (
                    <option key={lot._id} value={lot._id}>
                      {lotLabel(lot)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2">
                <p className={labelClass}>Operator penerima</p>
                <p className="text-xs leading-5 text-slate-500">
                  Pilih satu atau beberapa operator. Total kuantitas akan dibagi
                  rata; sisa pembagian diberikan ke operator teratas dalam
                  daftar.
                </p>
                <div className="space-y-2">
                  {operators
                    .filter((operator) => operator._id !== user?.id)
                    .map((operator) => {
                      const checked = selectedOperatorIds.includes(
                        operator._id,
                      );
                      return (
                        <label
                          key={operator._id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={Boolean(busyKey)}
                            onChange={(event) =>
                              setSelectedOperatorIds((current) =>
                                event.target.checked
                                  ? [...current, operator._id]
                                  : current.filter((id) => id !== operator._id),
                              )
                            }
                            className="size-4 accent-blue-600"
                          />
                          <span className="text-sm font-medium text-slate-800">
                            {operator.username}
                            {operator.email ? ` · ${operator.email}` : ''}
                          </span>
                        </label>
                      );
                    })}
                </div>
                <p className="text-xs font-medium text-blue-700">
                  {selectedOperatorIds.length} operator dipilih
                </p>
              </div>
              <label className={labelClass}>
                Jumlah yang diserahkan
                <input
                  required
                  type="number"
                  min={1}
                  max={selectedOutputLot?.availableQuantity ?? 0}
                  step={1}
                  inputMode="numeric"
                  value={transferForm.quantity}
                  onChange={(event) =>
                    setTransferForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  placeholder="Contoh: 25"
                  className={fieldClass}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Tersedia pada lot terpilih:{' '}
                  {formatNumber(selectedOutputLot?.availableQuantity ?? 0)}{' '}
                  unit.
                </span>
              </label>
              <label className={labelClass}>
                Catatan{' '}
                <span className="font-normal text-slate-400">(opsional)</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={transferForm.notes}
                  onChange={(event) =>
                    setTransferForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Catatan transfer..."
                  className={`${fieldClass} resize-y`}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={
                    Boolean(busyKey) ||
                    !selectedOutputLot ||
                    selectedOperatorIds.length === 0 ||
                    Number(transferForm.quantity) < selectedOperatorIds.length
                  }
                  className={primaryButtonClass}
                >
                  {busyKey ? 'Mentransfer...' : 'Konfirmasi transfer'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setSelectedWork(null);
                    setFormMode(null);
                  }}
                  className={secondaryButtonClass}
                >
                  Batal
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
