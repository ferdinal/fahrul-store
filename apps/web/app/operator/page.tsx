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

type ResultForm = {
  inputLotId: string;
  processedQuantity: string;
  goodQuantity: string;
  scrapQuantity: string;
  notes: string;
};
type WorkFilter = 'all' | 'new' | 'working' | 'completed';
type TransferForm = {
  sourceLotId: string;
  quantity: string;
  notes: string;
};
type DisplayWorkItem = OperatorWorkItem & {
  incomingTransfer?: IncomingTransfer;
};

const emptyResult: ResultForm = {
  inputLotId: '',
  processedQuantity: '0',
  goodQuantity: '0',
  scrapQuantity: '0',
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
function canFinalizeAfterCompletingStep(work: OperatorWorkItem) {
  return (work.order.steps ?? []).every(
    (step) =>
      step._id === work.step._id ||
      ['completed', 'cancelled'].includes(step.status),
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
function lotLabel(lot: ProductionLot, index: number) {
  return `Slot-${index + 1} (${formatNumber(lot.availableQuantity)}pcs)`;
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
function QuantityControl({
  label,
  value,
  min = 0,
  max,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
  className?: string;
}) {
  const current = value === '' ? 0 : Number(value);
  const decrement = () => onChange(String(Math.max(min, current - 1)));
  const increment = () =>
    onChange(
      String(max === undefined ? current + 1 : Math.min(max, current + 1)),
    );

  return (
    <div className={`min-w-0 rounded-2xl p-3 ${className}`}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <div className="flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white">
        <input
          required
          type="number"
          min={min}
          max={max}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 w-full flex-1 bg-transparent px-1 text-center text-sm font-bold tabular-nums text-slate-900 outline-none sm:text-base"
        />
        <div className="flex w-8 shrink-0 flex-col border-l border-slate-200 sm:w-9">
          <button
            type="button"
            aria-label={`Tambah ${label}`}
            disabled={max !== undefined && current >= max}
            onClick={increment}
            className="flex h-1/2 flex-1 items-center justify-center text-xs font-bold leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            +
          </button>
          <div className="h-px w-full bg-slate-200" />
          <button
            type="button"
            aria-label={`Kurangi ${label}`}
            disabled={current <= min}
            onClick={decrement}
            className="flex h-1/2 flex-1 items-center justify-center text-xs font-bold leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OperatorPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [available, setAvailable] = useState<OperatorWorkItem[]>([]);
  const [mine, setMine] = useState<OperatorWorkItem[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<
    IncomingTransfer[]
  >([]);
  const [selectedTransferProcessIds, setSelectedTransferProcessIds] = useState<
    string[]
  >([]);
  const [claimModalTransferId, setClaimModalTransferId] = useState<
    string | null
  >(null);
  // Checklist untuk memilih beberapa proses tersedia sebelum mulai bekerja.
  const [selectedAvailableKeys, setSelectedAvailableKeys] = useState<string[]>(
    [],
  );
  const [claimModalOrderId, setClaimModalOrderId] = useState<string | null>(
    null,
  );
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all');
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
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const currentList = useMemo<DisplayWorkItem[]>(() => {
    const byStep = new Map<string, DisplayWorkItem>();
    for (const work of available) {
      byStep.set(`${work.order._id}:${work.step._id}`, work);
    }
    for (const work of mine) {
      byStep.set(`${work.order._id}:${work.step._id}`, work);
    }

    // Satu transfer masuk ditampilkan sebagai satu card tugas standar.
    // Daftar proses lengkapnya tetap dipilih melalui modal Kerjakan.
    for (const transfer of incomingTransfers) {
      const firstStep = [...transfer.eligibleSteps].sort(
        (a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
      )[0];
      if (!firstStep) continue;
      const targetLotId = String(
        (transfer.transfer as typeof transfer.transfer & { targetLot?: string })
          .targetLot ?? '',
      );
      if (!targetLotId) continue;
      const work: DisplayWorkItem = {
        order: transfer.order,
        step: firstStep,
        inputLots: [
          {
            _id: targetLotId,
            lotCode: `TRANSFER-${transfer.transfer._id}`,
            quantity: transfer.transfer.quantity,
            availableQuantity: transfer.transfer.quantity,
            sourceStepId: transfer.transfer.sourceStepId,
            status: 'active',
          },
        ],
        availableQuantity: transfer.transfer.quantity,
        canStart: true,
        incomingTransfer: transfer,
      };
      byStep.set(`transfer:${transfer.transfer._id}`, work);
    }

    return Array.from(byStep.values()).sort((a, b) => {
      const orderCompare = String(a.order.orderNumber).localeCompare(
        String(b.order.orderNumber),
      );
      return (
        orderCompare ||
        Number(a.step.sequence ?? 0) - Number(b.step.sequence ?? 0)
      );
    });
  }, [available, mine, incomingTransfers]);
  const workCounts = useMemo(() => {
    const completed = currentList.filter(
      (work) =>
        String(work.step.ownerOperator ?? '') === user?.id &&
        work.step.status === 'completed' &&
        !(work.inputLots ?? []).some((lot) => lot.availableQuantity > 0),
    ).length;
    const newlyAvailable = new Set(
      currentList
        .filter(
          (work) =>
            work.step.ownerOperator == null &&
            work.showInNew !== false &&
            !['completed', 'cancelled'].includes(work.step.status),
        )
        .map((work) => work.order._id),
    ).size;
    const working = currentList.filter(
      (work) =>
        String(work.step.ownerOperator ?? '') === user?.id &&
        !(
          work.step.status === 'completed' &&
          !(work.inputLots ?? []).some((lot) => lot.availableQuantity > 0)
        ) &&
        work.step.status !== 'cancelled',
    ).length;
    return {
      all: newlyAvailable + working + completed,
      new: newlyAvailable,
      working,
      completed,
    };
  }, [currentList, user?.id]);
  const filteredList = useMemo(() => {
    const matchesFilter = (work: DisplayWorkItem) => {
      const hasRemainingInput = (work.inputLots ?? []).some(
        (lot) => lot.availableQuantity > 0,
      );
      const isCompleted =
        work.step.status === 'completed' && !hasRemainingInput;
      const ownedByCurrentOperator =
        String(work.step.ownerOperator ?? '') === user?.id;
      const isNew =
        work.step.ownerOperator == null &&
        work.showInNew !== false &&
        !['completed', 'cancelled'].includes(work.step.status);
      if (workFilter === 'new') return isNew;
      if (workFilter === 'working')
        return (
          ownedByCurrentOperator &&
          !isCompleted &&
          work.step.status !== 'cancelled'
        );
      if (workFilter === 'completed')
        return ownedByCurrentOperator && isCompleted;
      return (
        work.step.status !== 'cancelled' &&
        ((work.step.ownerOperator == null && work.showInNew !== false) ||
          ownedByCurrentOperator)
      );
    };

    const matching = currentList.filter(matchesFilter);
    // Ringkas semua proses yang belum diklaim menjadi satu kartu per PO
    // dan produk. Proses yang sudah diklaim tetap tampil satu kartu per step.
    const seenUnclaimedOrders = new Set<string>();
    const deduplicated = matching.filter((work) => {
      const isUnclaimed =
        work.step.ownerOperator == null &&
        !['completed', 'cancelled'].includes(work.step.status);
      if (!isUnclaimed) return true;

      const productId =
        typeof work.order.product === 'string'
          ? work.order.product
          : (work.order.product?._id ?? productName(work));
      const key = `${work.order._id}:${productId}`;
      if (seenUnclaimedOrders.has(key)) return false;
      seenUnclaimedOrders.add(key);
      return true;
    });
    if (workFilter !== 'all') return deduplicated;

    return deduplicated.sort((a, b) => {
      const aIsNew =
        a.step.ownerOperator == null &&
        a.showInNew !== false &&
        !['completed', 'cancelled'].includes(a.step.status);
      const bIsNew =
        b.step.ownerOperator == null &&
        b.showInNew !== false &&
        !['completed', 'cancelled'].includes(b.step.status);
      return Number(bIsNew) - Number(aIsNew);
    });
  }, [currentList, user?.id, workFilter]);
  const selectedAvailableWorks = available.filter(
    (work) =>
      work.order._id === claimModalOrderId &&
      work.step.ownerOperator == null &&
      !['completed', 'cancelled'].includes(work.step.status) &&
      work.canClaim !== false &&
      selectedAvailableKeys.includes(`${work.order._id}:${work.step._id}`),
  );
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
      const linkedStepIds = new Set<string>();
      const orderTransfers = incomingTransfers.filter(
        (item) => item.order._id === claimModalOrderId,
      );

      // Kaitkan transfer yang cocok dengan proses terpilih, lalu proses lain
      // tetap diklaim dari checklist yang sama.
      for (const transfer of orderTransfers) {
        const matchingWorks = selectedWorks.filter((work) =>
          transfer.eligibleSteps.some((step) => step._id === work.step._id),
        );
        if (matchingWorks.length === 0) continue;
        await selectTransferProcesses(
          transfer.transfer._id,
          matchingWorks.map((work) => work.step._id),
        );
        matchingWorks.forEach((work) => linkedStepIds.add(work.step._id));
        started.push(
          ...matchingWorks.map(
            (work) => `${work.order.orderNumber} · ${processName(work.step)}`,
          ),
        );
      }

      // Proses lain dalam PO tetap bisa diklaim dari checklist yang sama.
      for (const work of selectedWorks.filter(
        (item) => !linkedStepIds.has(item.step._id),
      )) {
        await startOperatorWork(work.order._id, work.step._id);
        started.push(`${work.order.orderNumber} · ${processName(work.step)}`);
      }
      setWorkFilter('working');
      setSelectedAvailableKeys([]);
      setSelectedTransferProcessIds([]);
      setClaimModalOrderId(null);
      setClaimModalTransferId(null);
      setNotice(
        `Berhasil mengambil ${started.length} proses: ${started.join('; ')}.`,
      );
      await loadWork(true);
    } catch (err) {
      const message = getErrorMessage(err);
      if (started.length > 0) setWorkFilter('working');
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
      processedQuantity: '0',
      goodQuantity: '0',
      scrapQuantity: '0',
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
      let productionCompleted = false;
      if (completeStep && canFinalizeAfterCompletingStep(selectedWork)) {
        await completeProductionOrder(
          selectedWork.order._id,
          selectedWork.step._id,
        );
        productionCompleted = true;
      }
      setNotice(
        `Hasil tersimpan: ${formatNumber(processedQuantity)} diproses, ${formatNumber(goodQuantity)} baik, ${formatNumber(scrapQuantity)} rusak${productionCompleted ? '. Proses terakhir dan produksi selesai; jumlah barang jadi aktual sudah dimasukkan ke inventori.' : completeStep ? '. Proses ditandai selesai.' : '. Proses masih dapat menerima pencatatan hasil berikutnya.'}`,
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
      let productionCompleted = false;
      if (canFinalizeAfterCompletingStep(work)) {
        await completeProductionOrder(work.order._id, work.step._id);
        productionCompleted = true;
      }
      setNotice(
        `Proses ${processName(work.step)} selesai. Tidak ada hasil atau lot baru yang dibuat.${productionCompleted ? ' Produksi juga selesai dan jumlah barang jadi aktual sudah dimasukkan ke inventori.' : ''}`,
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
        `Berhasil mengirim ${formatNumber(quantity)} unit ke ${recipientIds.length} operator. Setiap operator menerima bagian kuantitasnya dan memilih proses tujuan sendiri.`,
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
    <main className="min-h-dvh overflow-x-hidden bg-white text-slate-900">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-2 py-4 sm:px-3 sm:py-6">
        <section className="relative overflow-hidden rounded-2xl bg-white px-1 py-2">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-64 rotate-[32deg] bg-gradient-to-r from-red-600 to-blue-800 opacity-95" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#102b59] text-lg font-black text-white shadow-sm">
                FS
              </div>
              <p className="text-xl font-extrabold tracking-tight text-[#102b59]">
                Fahrul Store
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWork(true)}
              disabled={refreshing}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? 'Memuat...' : 'Refresh'}
            </button>
          </div>
          <div className="relative mt-9">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-[#101d3b] sm:text-4xl">
              Halo, {user?.username || 'Operator'}
            </h1>
            <p className="mt-1 text-2xl font-bold text-[#101d3b] sm:text-3xl">
              Selamat <span className="text-red-600">bekerja!</span>
            </p>
            <div className="mt-2 h-1 w-28 rounded-full bg-red-600" />
          </div>
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

        <nav
          aria-label="Filter pekerjaan"
          className="flex w-full items-center gap-6 overflow-x-auto border-b border-slate-200 px-1"
        >
          {(
            [
              ['all', 'Semua', workCounts.all],
              ['new', 'Baru', workCounts.new],
              ['working', 'Dikerjakan', workCounts.working],
              ['completed', 'Selesai', workCounts.completed],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setWorkFilter(value)}
              className={`relative shrink-0 py-3 text-sm font-semibold transition ${
                workFilter === value
                  ? 'text-blue-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label} ({count})
              {workFilter === value && (
                <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-blue-700" />
              )}
            </button>
          ))}
        </nav>

        <section className="overflow-hidden bg-transparent">
          <div className="mb-3">
            <h2 className="text-lg font-extrabold text-[#101d3b]">
              Daftar pekerjaan
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tugas baru dan proses yang sudah dikerjakan dalam satu daftar.
            </p>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Memuat pekerjaan Operator...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center sm:p-12">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">
                ✓
              </div>
              <h3 className="mt-4 font-bold text-slate-900">
                {workFilter === 'all'
                  ? 'Belum ada pekerjaan'
                  : workFilter === 'new'
                    ? 'Tidak ada tugas baru'
                    : workFilter === 'working'
                      ? 'Tidak ada pekerjaan yang sedang dikerjakan'
                      : 'Belum ada pekerjaan selesai'}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Pekerjaan akan muncul saat Production Order ditugaskan kepadamu.
              </p>
              <button
                type="button"
                onClick={() => void loadWork(true)}
                className={`${secondaryButtonClass} mt-5`}
              >
                Periksa lagi
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2">
              {filteredList.map((work) => {
                const availableProcessCount = available.filter(
                  (item) =>
                    item.order._id === work.order._id &&
                    item.step.ownerOperator == null &&
                    !['completed', 'cancelled'].includes(item.step.status),
                ).length;
                const key = work.incomingTransfer
                  ? `transfer:${work.incomingTransfer.transfer._id}`
                  : `${work.order._id}:${work.step._id}`;
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
                const allInputLotsRecorded =
                  !hasRemainingInput &&
                  Number(work.step.quantityProcessed ?? 0) > 0;
                const isLastWorkflowStep = !(work.order.steps ?? []).some(
                  (step) =>
                    (step.dependsOn ?? []).some(
                      (dependency) => String(dependency) === work.step._id,
                    ),
                );
                const finalStepFinished =
                  isLastWorkflowStep &&
                  (work.step.status === 'completed' ||
                    (!hasRemainingInput &&
                      Number(work.step.quantityProcessed ?? 0) > 0));
                const finalStepOwned =
                  isLastWorkflowStep && work.step.ownerOperator != null;
                const allOutputLotsSent = work.outputLotsTransferred === true;
                const hasTransferableOutput = (work.outputLots ?? []).some(
                  (lot) => lot.availableQuantity > 0,
                );
                return (
                  <article
                    key={key}
                    className={`min-w-0 rounded-2xl border border-slate-200 border-l-4 ${displayStatus === 'completed' ? 'border-l-green-600' : displayStatus === 'in_progress' || displayStatus === 'partially_completed' ? 'border-l-blue-600' : 'border-l-red-600'} bg-white p-2 shadow-sm transition`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-extrabold leading-snug text-slate-900">
                          {productName(work)}
                        </h3>
                        <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            No. PO
                          </span>
                          <span className="break-all text-xs font-bold text-slate-600">
                            {work.order.orderNumber}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg border-0 px-3 py-1.5 text-xs font-bold ${work.step.ownerOperator == null ? 'bg-yellow-400 text-slate-900' : displayStatus === 'completed' ? 'bg-green-500 text-white' : displayStatus === 'in_progress' || displayStatus === 'partially_completed' ? 'bg-blue-600 text-white' : 'bg-yellow-400 text-slate-900'}`}
                      >
                        {work.step.ownerOperator == null
                          ? 'Tugas'
                          : statusLabel(displayStatus)}
                      </span>
                    </div>
                    <div className="mt-2 rounded-xl bg-slate-100/80 px-3 py-2">
                      {/* <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                        Proses produksi
                        {work.step.ownerOperator == null && !work.incomingTransfer
                          ? ` · ${availableProcessCount} proses tersedia`
                          : ` · Urutan ${work.step.sequence ?? '-'}`}
                      </p> */}
                      {/* <p className="mt-1 font-bold text-slate-900">
                        {processName(work.step)}
                      </p> */}
                      <div className="mt-2 grid grid-cols-2 gap-2 pt-2 text-xs">
                        <div>
                          <p className="text-slate-500">Jumlah Dikirim</p>
                          <p className="mt-1 font-bold text-slate-900">
                            {formatNumber(work.availableQuantity)} unit
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
                    {work.incomingTransfer && (
                      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        Transfer masuk dari{' '}
                        {work.incomingTransfer.sourceStep?.processName ||
                          work.incomingTransfer.sourceStep?.processCode ||
                          work.incomingTransfer.sourceStep?.process ||
                          'proses sebelumnya'}{' '}
                        ·{' '}
                        {formatNumber(work.incomingTransfer.transfer.quantity)}{' '}
                        unit · {work.incomingTransfer.eligibleSteps.length}{' '}
                        proses tersedia untuk dipilih
                      </p>
                    )}
                    {/* <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-xs text-slate-500">Diproses</p>
                        <p className="mt-1 font-bold text-slate-900">
                          {formatNumber(work.step.quantityProcessed ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-2">
                        <p className="text-xs text-emerald-700">Baik</p>
                        <p className="mt-1 font-bold text-emerald-800">
                          {formatNumber(work.step.quantityGood ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-red-50 p-2">
                        <p className="text-xs text-red-700">Rusak</p>
                        <p className="mt-1 font-bold text-red-800">
                          {formatNumber(work.step.quantityScrap ?? 0)}
                        </p>
                      </div>
                    </div> */}
                    {/* {(work.inputLots?.length ?? 0) > 0 && (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Lot input:{' '}
                        {work.inputLots
                          .filter((lot) => lot.availableQuantity > 0)
                          .map(
                            (lot, index) =>
                              lotLabel(lot, index),
                          )
                          .join(', ') || 'Tidak ada stok tersisa'}
                      </p>
                    )} */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {work.step.ownerOperator == null &&
                        !['completed', 'cancelled'].includes(
                          work.step.status,
                        ) && (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              setClaimModalOrderId(work.order._id);
                              setClaimModalTransferId(null);
                              setSelectedAvailableKeys([]);
                              setSelectedTransferProcessIds([]);
                              setError('');
                              setNotice('');
                            }}
                            className={primaryButtonClass}
                          >
                            Kerjakan
                          </button>
                        )}
                      {work.step.ownerOperator != null &&
                        (canRecordResult || allInputLotsRecorded) && (
                          <button
                            type="button"
                            disabled={Boolean(busyKey) || allInputLotsRecorded}
                            onClick={() => openResult(work)}
                            className={`${primaryButtonClass} min-h-9 px-3 py-2 bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/20`}
                          >
                            {allInputLotsRecorded
                              ? 'Semua tercatat'
                              : 'Catat hasil'}
                          </button>
                        )}
                      {work.step.ownerOperator != null &&
                        work.step.status !== 'cancelled' &&
                        (hasTransferableOutput ||
                          allOutputLotsSent ||
                          finalStepOwned) && (
                          <button
                            type="button"
                            disabled={
                              Boolean(busyKey) ||
                              finalStepOwned ||
                              allOutputLotsSent
                            }
                            onClick={() => {
                              if (
                                selectedWork?.order._id === work.order._id &&
                                selectedWork?.step._id === work.step._id &&
                                formMode === 'transfer'
                              ) {
                                setSelectedWork(null);
                                setFormMode(null);
                              } else {
                                openTransfer(work);
                              }
                            }}
                            className={secondaryButtonClass}
                          >
                            {finalStepFinished
                              ? 'Proses selesai'
                              : finalStepOwned
                                ? 'Proses akhir'
                                : allOutputLotsSent
                                  ? 'Terkirim'
                                  : selectedWork?.order._id ===
                                        work.order._id &&
                                      selectedWork?.step._id ===
                                        work.step._id &&
                                      formMode === 'transfer'
                                    ? 'Tutup Kirim Ke'
                                    : 'Kirim Ke'}
                          </button>
                        )}
                      {work.step.ownerOperator != null &&
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
                      {work.step.ownerOperator != null &&
                        work.step.status === 'completed' &&
                        !hasRemainingInput && (
                          <span className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                            Proses selesai
                          </span>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {claimModalOrderId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busyKey) {
                setClaimModalOrderId(null);
                setClaimModalTransferId(null);
                setSelectedTransferProcessIds([]);
                setSelectedAvailableKeys([]);
              }
            }}
          >
            <div className="max-h-[82dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Pilih proses
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {claimModalTransferId
                      ? incomingTransfers.find(
                          (item) => item.transfer._id === claimModalTransferId,
                        )?.order.orderNumber
                      : available.find(
                          (work) => work.order._id === claimModalOrderId,
                        )?.order.orderNumber}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setClaimModalOrderId(null);
                    setClaimModalTransferId(null);
                    setSelectedTransferProcessIds([]);
                    setSelectedAvailableKeys([]);
                  }}
                  className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup modal"
                >
                  ×
                </button>
              </div>
              <div className="space-y-1">
                {claimModalTransferId
                  ? (
                      incomingTransfers.find(
                        (item) => item.transfer._id === claimModalTransferId,
                      )?.eligibleSteps ?? []
                    )
                      .slice()
                      .sort(
                        (a, b) =>
                          Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
                      )
                      .map((step) => {
                        const checked = selectedTransferProcessIds.includes(
                          step._id,
                        );
                        return (
                          <label
                            key={step._id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-blue-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={Boolean(busyKey)}
                              onChange={(event) =>
                                setSelectedTransferProcessIds((current) =>
                                  event.target.checked
                                    ? [...current, step._id]
                                    : current.filter((id) => id !== step._id),
                                )
                              }
                              className="mt-1 size-4 shrink-0 accent-blue-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">
                                #{step.sequence ?? '-'} ·{' '}
                                {step.processName ||
                                  step.processCode ||
                                  step.process ||
                                  'Proses'}
                              </span>
                              <span className="block text-xs text-slate-500">
                                Transfer tersedia:{' '}
                                {formatNumber(
                                  incomingTransfers.find(
                                    (item) =>
                                      item.transfer._id ===
                                      claimModalTransferId,
                                  )?.transfer.quantity ?? 0,
                                )}{' '}
                                unit
                              </span>
                            </span>
                          </label>
                        );
                      })
                  : available
                      .filter((work) => work.order._id === claimModalOrderId)
                      .sort(
                        (a, b) =>
                          Number(a.step.sequence ?? 0) -
                          Number(b.step.sequence ?? 0),
                      )
                      .map((work) => {
                        const key = `${work.order._id}:${work.step._id}`;
                        const selectable =
                          work.step.ownerOperator == null &&
                          work.canClaim !== false &&
                          !['completed', 'cancelled'].includes(
                            work.step.status,
                          );
                        const checked = selectedAvailableKeys.includes(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-start gap-2 rounded-lg px-2 py-2 ${
                              selectable
                                ? 'cursor-pointer hover:bg-blue-50'
                                : 'cursor-not-allowed bg-slate-50 opacity-60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!selectable || Boolean(busyKey)}
                              onChange={(event) =>
                                setSelectedAvailableKeys((current) =>
                                  event.target.checked
                                    ? [...current, key]
                                    : current.filter((item) => item !== key),
                                )
                              }
                              className="mt-1 size-4 shrink-0 accent-blue-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">
                                #{work.step.sequence ?? '-'} ·{' '}
                                {processName(work.step)}
                              </span>
                              <span className="block text-xs text-slate-500">
                                {selectable
                                  ? work.availableQuantity > 0
                                    ? `Input tersedia: ${formatNumber(work.availableQuantity)} unit`
                                    : 'Menunggu lot input tersedia'
                                  : work.step.ownerOperator
                                    ? 'Sudah diambil operator'
                                    : statusLabel(work.step.status)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setClaimModalOrderId(null);
                    setClaimModalTransferId(null);
                    setSelectedTransferProcessIds([]);
                    setSelectedAvailableKeys([]);
                  }}
                  className={`${secondaryButtonClass} flex-1`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={
                    Boolean(busyKey) ||
                    (claimModalTransferId
                      ? selectedTransferProcessIds.length === 0
                      : selectedAvailableWorks.length === 0)
                  }
                  onClick={() => void handleStartSelected()}
                  className={`${primaryButtonClass} flex-1`}
                >
                  {busyKey === 'claim-selected-processes'
                    ? 'Memulai...'
                    : `Kerjakan (${claimModalTransferId ? selectedTransferProcessIds.length : selectedAvailableWorks.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedWork && formMode === 'result' && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busyKey) {
                setSelectedWork(null);
                setFormMode(null);
              }
            }}
          >
            <form
              id={`result-form-${selectedWork.order._id}-${selectedWork.step._id}`}
              onSubmit={handleRecordResult}
              className="max-h-[88dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Catat hasil
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedWork.order.orderNumber} ·{' '}
                    {processName(selectedWork.step)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setSelectedWork(null);
                    setFormMode(null);
                  }}
                  aria-label="Tutup modal"
                  className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              <label className={labelClass}>
                Lot input
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
                  {selectedInputLots.map((lot, index) => (
                    <option key={lot._id} value={lot._id}>
                      {lotLabel(lot, index)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <QuantityControl
                  label="Diproses"
                  min={1}
                  max={selectedInputLot?.availableQuantity ?? 0}
                  value={resultForm.processedQuantity}
                  onChange={(value) =>
                    setResultForm((current) => ({
                      ...current,
                      processedQuantity: value,
                    }))
                  }
                  className="bg-slate-50"
                />
                <QuantityControl
                  label="Baik"
                  value={resultForm.goodQuantity}
                  max={Number(resultForm.processedQuantity) || undefined}
                  onChange={(value) =>
                    setResultForm((current) => ({
                      ...current,
                      goodQuantity: value,
                    }))
                  }
                  className="bg-emerald-50"
                />
                <QuantityControl
                  label="Rusak"
                  value={resultForm.scrapQuantity}
                  max={Number(resultForm.processedQuantity) || undefined}
                  onChange={(value) =>
                    setResultForm((current) => ({
                      ...current,
                      scrapQuantity: value,
                    }))
                  }
                  className="bg-red-50"
                />
              </div>

              <p className="text-xs text-slate-500">
                Total produk baik + rusak harus sama dengan jumlah diproses.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="action"
                  value="save-result"
                  disabled={Boolean(busyKey) || !selectedInputLot}
                  className={`${primaryButtonClass} flex-1 bg-blue-700 hover:bg-blue-800 focus-visible:ring-blue-500/20`}
                >
                  {busyKey ? 'Menyimpan...' : 'Simpan hasil'}
                </button>
                <button
                  type="submit"
                  name="action"
                  value="complete-step"
                  disabled={
                    Boolean(busyKey) || !canCompleteStepWithCurrentEntry
                  }
                  className={`${secondaryButtonClass} flex-1 border-emerald-200 px-3 py-2 text-emerald-700`}
                >
                  Selesai proses
                </button>
              </div>
            </form>
          </div>
        )}

        {selectedWork && formMode === 'transfer' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busyKey) {
                setSelectedWork(null);
                setFormMode(null);
              }
            }}
          >
            <form
              onSubmit={handleTransfer}
              className="max-h-[82dvh] w-full max-w-md space-y-2.5 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold text-slate-900">
                    Kirim ke
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedWork.order.orderNumber} ·{' '}
                    {processName(selectedWork.step)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setSelectedWork(null);
                    setFormMode(null);
                  }}
                  aria-label="Tutup modal"
                  className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,2fr)_minmax(96px,1fr)] gap-2">
                <label className={labelClass}>
                  Lot sumber
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
                        quantity: lot ? String(lot.availableQuantity) : '',
                      }));
                    }}
                    className={`${fieldClass} min-h-9 py-1.5`}
                  >
                    {selectedOutputLots.map((lot, index) => (
                      <option key={lot._id} value={lot._id}>
                        {lotLabel(lot, index)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Jumlah dikirim
                  <p className="mt-1.5 flex min-h-9 items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-800">
                    {formatNumber(selectedOutputLot?.availableQuantity ?? 0)}{' '}
                    pcs
                  </p>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    Seluruh stok lot akan dikirim.
                  </span>
                </label>
              </div>

              <div className="space-y-1">
                <p className={labelClass}>Operator penerima</p>
                <div className="grid max-h-24 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
                  {operators
                    .filter((operator) => operator._id !== user?.id)
                    .map((operator) => {
                      const checked = selectedOperatorIds.includes(
                        operator._id,
                      );
                      return (
                        <label
                          key={operator._id}
                          className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5"
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
                            className="size-3.5 shrink-0 accent-blue-600"
                          />
                          <span className="min-w-0 break-words text-sm font-medium text-slate-800">
                            {operator.username}
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
                Catatan{' '}
                <span className="font-normal text-slate-400">(opsional)</span>
                <textarea
                  rows={1}
                  maxLength={2000}
                  value={transferForm.notes}
                  onChange={(event) =>
                    setTransferForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Catatan pengiriman..."
                  className={`${fieldClass} min-h-9 py-1.5 resize-y`}
                />
              </label>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    setSelectedWork(null);
                    setFormMode(null);
                  }}
                  className={`${secondaryButtonClass} flex-1`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    Boolean(busyKey) ||
                    !selectedOutputLot ||
                    selectedOperatorIds.length === 0 ||
                    Number(transferForm.quantity) < selectedOperatorIds.length
                  }
                  className={`${primaryButtonClass} flex-1`}
                >
                  {busyKey ? 'Mengirim...' : 'Kirim'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
