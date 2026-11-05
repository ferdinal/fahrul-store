'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

type ProductInfo = {
  _id: string;
  name: string;
  version?: string | number;
  body?: string;
};

type ProductionRequirement = {
  product: ProductInfo;
  demandQuantity: number;
  inventory: {
    physicalQuantity: number;
    allocatedQuantity: number;
    availableQuantity: number;
  };
  production: {
    plannedQuantity: number;
    inProgressQuantity: number;
    totalQuantity: number;
  };
  totalSupply: number;
  productionNeed: number;
};

type RequirementsResponse =
  | ProductionRequirement[]
  | {
      data?:
        | ProductionRequirement[]
        | {
            data?: ProductionRequirement[];
            requirements?: ProductionRequirement[];
          };
      requirements?: ProductionRequirement[];
    };

type CreateBatchResponse = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

type ProductionStep = {
  _id: string;
  sequence?: number;
  processName?: string;
  processCode?: string;
  process?: string | { name?: string };
  status: string;
  quantityProcessed?: number;
  quantityGood?: number;
  quantityScrap?: number;
  ownerOperator?: string | null;
  dependsOn?: string[];
  inputLots?: {
    _id: string;
    lotCode: string;
    availableQuantity: number;
    quantity?: number;
  }[];
  outputLots?: { _id: string; lotCode?: string; availableQuantity: number }[];
  hasTransferredOutput?: boolean;
};

type ProductionOrder = {
  _id: string;
  orderNumber: string;
  quantity: number;
  status: string;
  product?: ProductInfo | string | null;
  steps?: ProductionStep[];
  step?: ProductionStep;
  availableQuantity?: number;
  inputLots?: { _id: string; lotCode?: string; availableQuantity: number }[];
};

type OrdersResponse =
  | ProductionOrder[]
  | {
      success?: boolean;
      data?:
        | ProductionOrder[]
        | { orders?: ProductionOrder[]; data?: ProductionOrder[] };
      orders?: ProductionOrder[];
    };

function normalizeOrders(response: OrdersResponse): ProductionOrder[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && !Array.isArray(response.data)) {
    if (Array.isArray(response.data.orders)) return response.data.orders;
    if (Array.isArray(response.data.data)) return response.data.data;
  }
  if (Array.isArray(response.orders)) return response.orders;
  throw new Error('Format daftar Production Order tidak sesuai.');
}

function orderProductId(order: ProductionOrder): string | undefined {
  return typeof order.product === 'string' ? order.product : order.product?._id;
}

function firstProductionStep(
  order: ProductionOrder,
): ProductionStep | undefined {
  return [...(order.steps ?? (order.step ? [order.step] : []))].sort(
    (a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
  )[0];
}

function hasRemainingStepInput(step: ProductionStep): boolean {
  return (step.inputLots ?? []).some((lot) => lot.availableQuantity > 0);
}

function isStepInProgress(step: ProductionStep): boolean {
  return (
    ['in_progress', 'partially_completed'].includes(step.status) ||
    (step.status === 'completed' && hasRemainingStepInput(step))
  );
}

function isStepCompleted(step: ProductionStep): boolean {
  return step.status === 'completed' && !hasRemainingStepInput(step);
}

function isAdminOperatorWorkCompleted(order: ProductionOrder): boolean {
  return firstProductionStep(order)?.status === 'completed';
}

function operatorStatus(status: string): string {
  const labels: Record<string, string> = {
    planned: 'Direncanakan',
    in_progress: 'Sedang berjalan',
    partially_completed: 'Selesai sebagian',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
  };
  return labels[status] ?? status;
}

function stepTitle(step: ProductionStep): string {
  return (
    step.processName ||
    step.processCode ||
    (typeof step.process === 'string' ? step.process : step.process?.name) ||
    'Proses'
  );
}

function OperatorStyleOrderCard({
  order,
  productFallback,
  workflowSteps: providedWorkflowSteps,
  onRefresh,
  isDikerjakanMenu = false,
}: {
  order: ProductionOrder;
  productFallback?: ProductInfo;
  workflowSteps?: ProductionStep[];
  onRefresh: () => Promise<unknown>;
  isDikerjakanMenu?: boolean;
}) {
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [inputLotId, setInputLotId] = useState('');
  const [processedQuantity, setProcessedQuantity] = useState('0');
  const [goodQuantity, setGoodQuantity] = useState('0');
  const [scrapQuantity, setScrapQuantity] = useState('0');
  const [notes, setNotes] = useState('');
  const [completeAfterResult, setCompleteAfterResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transferStepId, setTransferStepId] = useState<string | null>(null);
  const [operators, setOperators] = useState<
    { _id: string; username: string }[]
  >([]);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [transferNotes, setTransferNotes] = useState('');
  const [operatorsLoading, setOperatorsLoading] = useState(false);

  const steps = order.steps?.length
    ? order.steps
    : order.step
      ? [order.step]
      : [];
  const workflowSteps = providedWorkflowSteps?.length
    ? providedWorkflowSteps
    : steps;
  const product =
    typeof order.product === 'object' && order.product
      ? order.product.name
      : productFallback?.name || 'Produk';
  const selectedStep = steps.find((step) => step._id === activeStepId) ?? null;
  const allStepsTerminal =
    workflowSteps.length > 0 &&
    workflowSteps.every((step) => ['completed', 'cancelled'].includes(step.status));
  const hasCompletedStep = workflowSteps.some(
    (step) => step.status === 'completed',
  );
  const finalizationStep =
    workflowSteps.find((step) => step.status === 'completed') ?? null;
  const canFinalizeProduction =
    allStepsTerminal &&
    hasCompletedStep &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    Boolean(finalizationStep);
  const transferStep =
    steps.find((step) => step._id === transferStepId) ?? null;
  const selectedOutputLots = (transferStep?.outputLots ?? []).filter(
    (lot, index, all) =>
      lot.availableQuantity > 0 &&
      all.findIndex((item) => item._id === lot._id) === index,
  );
  const selectedOutputLot = selectedOutputLots[0] ?? null;

  useEffect(() => {
    if (!transferStepId) return;

    let cancelled = false;

    const loadOperators = async () => {
      try {
        const response = await apiFetch<{
          success?: boolean;
          data?:
            | { _id: string; username: string }[]
            | {
                operators?: { _id: string; username: string }[];
                data?: { _id: string; username: string }[];
              };
          operators?: { _id: string; username: string }[];
        }>('/api/operator-work/operators');

        const responseData = response?.data;
        const operatorList = Array.isArray(responseData)
          ? responseData
          : (responseData?.operators ??
            responseData?.data ??
            response?.operators ??
            []);

        if (!cancelled) {
          setOperators(operatorList);
        }
      } catch (err) {
        if (!cancelled) {
          setOperators([]);
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setOperatorsLoading(false);
        }
      }
    };

    // Defer state updates so they are not executed synchronously in the effect.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setOperatorsLoading(true);
      setError('');
      void loadOperators();
    });

    return () => {
      cancelled = true;
    };
  }, [transferStepId]);
  const selectedInputLots = (selectedStep?.inputLots ?? []).filter(
    (lot) => lot.availableQuantity > 0,
  );
  const selectedInputLot =
    selectedInputLots.find((lot) => lot._id === inputLotId) ??
    selectedInputLots[0];
  const totalAvailableInputQuantity = selectedInputLots.reduce(
    (total, lot) => total + Math.max(0, Number(lot.availableQuantity) || 0),
    0,
  );
  const enteredProcessedQuantity = Number(processedQuantity);
  const canCompleteStepWithCurrentEntry = Boolean(
    selectedInputLot &&
    Number.isSafeInteger(enteredProcessedQuantity) &&
    enteredProcessedQuantity > 0 &&
    enteredProcessedQuantity === Number(selectedInputLot.availableQuantity) &&
    enteredProcessedQuantity === totalAvailableInputQuantity,
  );

  function openResult(step: ProductionStep, completeAfterSave = false) {
    setCompleteAfterResult(completeAfterSave);
    const lots = (step.inputLots ?? []).filter(
      (lot) => lot.availableQuantity > 0,
    );
    setActiveStepId(step._id);
    setInputLotId(lots[0]?._id ?? '');
    setProcessedQuantity('0');
    setGoodQuantity('0');
    setScrapQuantity('0');
    setNotes('');
    setError('');
    setNotice('');
  }

  async function submitResult(
    event: FormEvent<HTMLFormElement>,
    step: ProductionStep,
  ) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const completeStep =
      completeAfterResult || submitter?.value === 'complete-step';

    // Pada kondisi semua input sudah habis dan hasil sudah pernah dicatat,
    // penyelesaian proses cukup mengubah status step. Jangan buat result/lot baru.
    if (completeAfterResult) {
      setBusy(true);
      setError('');
      setNotice('');
      try {
        await apiFetch(
          `/api/production-orders/${order._id}/steps/${step._id}/complete-step`,
          { method: 'POST' },
        );
        setNotice(
          'Proses berhasil diselesaikan. Hasil produksi yang sudah tercatat tetap digunakan.',
        );
        setActiveStepId(null);
        setCompleteAfterResult(false);
        await onRefresh();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    const processed = Number(processedQuantity);
    const good = Number(goodQuantity);
    const scrap = Number(scrapQuantity);
    const inputLot =
      selectedInputLots.find((lot) => lot._id === inputLotId) ??
      selectedInputLots[0];

    if (!inputLot) {
      setError(
        'Tidak ada lot input aktif yang tersedia. Jika proses telanjur berstatus selesai, stok input yang tersisa akan membuka pencatatan lanjutan.',
      );
      return;
    }
    if (!Number.isSafeInteger(processed) || processed < 1) {
      setError('Jumlah diproses harus bilangan bulat minimal 1.');
      return;
    }
    if (
      !Number.isSafeInteger(good) ||
      good < 0 ||
      !Number.isSafeInteger(scrap) ||
      scrap < 0
    ) {
      setError(
        'Jumlah baik dan rusak harus berupa bilangan bulat nol atau lebih.',
      );
      return;
    }
    if (good + scrap !== processed) {
      setError('Jumlah produk baik + rusak harus sama dengan jumlah diproses.');
      return;
    }
    if (processed > inputLot.availableQuantity) {
      setError(
        `Jumlah diproses melebihi stok lot terpilih (${formatNumber(inputLot.availableQuantity)} unit).`,
      );
      return;
    }
    if (completeStep && !canCompleteStepWithCurrentEntry) {
      setError(
        `Proses belum bisa diselesaikan. Total input aktif yang tersisa ${formatNumber(totalAvailableInputQuantity)} unit. Jika baru mengerjakan sebagian, klik Simpan hasil terlebih dahulu. Catat sisa input pada pencatatan berikutnya, lalu pilih Selesai proses ketika semua input sudah diproses.`,
      );
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(
        `/api/production-orders/${order._id}/steps/${step._id}/results`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            notes,
            completeStep,
            allocations: [
              {
                inputLot: inputLot._id,
                quantityProcessed: processed,
                goodQuantity: good,
                scrapQuantity: scrap,
              },
            ],
          }),
        },
      );
      setNotice(
        `Hasil tersimpan: ${formatNumber(processed)} diproses, ${formatNumber(good)} baik, ${formatNumber(scrap)} rusak${completeStep ? '. Proses ditandai selesai.' : '. Proses masih dapat menerima pencatatan hasil berikutnya.'}`,
      );
      setActiveStepId(null);
      setCompleteAfterResult(false);
      setProcessedQuantity('0');
      setGoodQuantity('0');
      setScrapQuantity('0');
      setNotes('');
      await onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteProduction() {
    if (!canFinalizeProduction || !finalizationStep) {
      setError(
        'Selesaikan semua proses wajib terlebih dahulu. Minimal satu proses harus berstatus selesai.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Selesaikan produksi ${order.orderNumber} dan masukkan seluruh barang baik dari proses terakhir ke inventori Finished Goods?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const response = await apiFetch<{
        success?: boolean;
        message?: string;
        data?: { finalGoodQuantity?: number; shortfallQuantity?: number };
      }>(
        `/api/production-orders/${order._id}/steps/${finalizationStep._id}/complete-production`,
        { method: 'POST' },
      );

      const finalGoodQuantity = Number(response?.data?.finalGoodQuantity ?? 0);
      setNotice(
        response?.message ||
          `Produksi ${order.orderNumber} selesai. ${formatNumber(finalGoodQuantity)} unit barang baik sudah diproses untuk masuk ke inventori Finished Goods.`,
      );
      await onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferStep || !selectedOutputLot) return;
    const recipients = [...new Set(selectedOperatorIds)];
    const quantity = Number(selectedOutputLot.availableQuantity);

    if (recipients.length === 0) {
      setError('Pilih minimal satu Operator penerima.');
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < recipients.length) {
      setError(
        `Jumlah transfer minimal ${recipients.length} unit karena setiap operator harus menerima minimal 1 unit.`,
      );
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(
        `/api/operator-work/orders/${order._id}/steps/${transferStep._id}/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetOperatorIds: recipients,
            sourceLotId: selectedOutputLot._id,
            quantity,
            idempotencyKey: crypto.randomUUID(),
            notes: transferNotes,
          }),
        },
      );
      setNotice(
        `Berhasil mengirim ${formatNumber(quantity)} unit ke ${recipients.length} operator. Setiap operator menerima bagian kuantitasnya dan memilih proses tujuan sendiri.`,
      );
      setTransferStepId(null);
      setSelectedOperatorIds([]);
      setTransferNotes('');
      await onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Detail proses belum tersedia pada respons Production Order.
        </p>
      )}
      {(steps.length ? steps : [null]).map((step, index) => {
        const inputLots = (step?.inputLots ?? []).filter(
          (lot) => lot.availableQuantity > 0,
        );
        const hasRemainingInput = inputLots.length > 0;
        // Samakan koreksi status card Operator: completed dengan input tersisa
        // tetap ditampilkan sebagai proses yang masih perlu dilanjutkan.
        const displayStatus =
          step?.status === 'completed' && hasRemainingInput
            ? 'partially_completed'
            : step?.status || order.status;
        const available = inputLots.reduce(
          (sum, lot) => sum + lot.availableQuantity,
          0,
        );
        const active = Boolean(step && activeStepId === step._id);
        const canRecord = Boolean(
          step &&
          step.status !== 'cancelled' &&
          (step.status !== 'completed' || hasRemainingInput) &&
          hasRemainingInput,
        );
        const allInputLotsRecorded = Boolean(
          step &&
          !hasRemainingInput &&
          Number(step.quantityProcessed ?? 0) > 0,
        );
        const currentStepId = step?._id;
        const isLastWorkflowStep = Boolean(
          currentStepId &&
          !workflowSteps.some((candidate) =>
            (candidate.dependsOn ?? []).some(
              (dependencyId) => String(dependencyId) === currentStepId,
            ),
          ),
        );
        const finalStepFinished = Boolean(
          isLastWorkflowStep &&
          step &&
          (step.status === 'completed' || allInputLotsRecorded),
        );
        const finalStepOwned = Boolean(
          isLastWorkflowStep && step?.ownerOperator != null,
        );
        const hasAvailableOutput = (step?.outputLots ?? []).some(
          (lot) => lot.availableQuantity > 0,
        );
        const allOutputLotsSent = Boolean(
          step?.hasTransferredOutput && !hasAvailableOutput,
        );
        const canCompleteStep = Boolean(
          step &&
          isDikerjakanMenu &&
          ['in_progress', 'partially_completed'].includes(step.status) &&
          allInputLotsRecorded,
        );

        return (
          <article
            key={step?._id || `${order._id}:${index}`}
            className={`min-w-0 rounded-2xl border border-slate-200 border-l-4 ${
              displayStatus === 'completed'
                ? 'border-l-green-600'
                : displayStatus === 'in_progress' ||
                    displayStatus === 'partially_completed'
                  ? 'border-l-blue-600'
                  : 'border-l-red-600'
            } bg-white p-2 shadow-sm transition`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-extrabold leading-snug text-slate-900">
                  {product}
                </h3>
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    No. PO
                  </span>
                  <span className="break-all text-xs font-bold text-slate-600">
                    {order.orderNumber}
                  </span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-lg border-0 px-3 py-1.5 text-xs font-bold ${
                  step?.ownerOperator == null && displayStatus !== 'completed'
                    ? 'bg-yellow-400 text-slate-900'
                    : displayStatus === 'completed'
                    ? 'bg-green-500 text-white'
                    : displayStatus === 'in_progress' ||
                        displayStatus === 'partially_completed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-yellow-400 text-slate-900'
                }`}
              >
                {step?.ownerOperator == null && displayStatus !== 'completed'
                  ? 'Tugas'
                  : operatorStatus(displayStatus)}
              </span>
            </div>

            <div className="mt-2 rounded-xl bg-slate-100/80 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Proses produksi · Urutan {step?.sequence ?? '-'}
              </p>
              <p className="mt-1 font-bold text-slate-900">
                {step ? stepTitle(step) : 'Menunggu detail proses'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-blue-100 pt-2 text-xs">
                <div>
                  <p className="text-slate-500">Jumlah order</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {formatNumber(order.quantity)} unit
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Lot input tersedia</p>
                  <p className="mt-1 font-bold text-emerald-700">
                    {step ? `${formatNumber(available)} unit` : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="rounded-xl bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Diproses</p>
                <p className="mt-1 font-bold text-slate-900">
                  {formatNumber(step?.quantityProcessed ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="text-xs text-emerald-700">Baik</p>
                <p className="mt-1 font-bold text-emerald-800">
                  {formatNumber(step?.quantityGood ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-2">
                <p className="text-xs text-red-700">Rusak</p>
                <p className="mt-1 font-bold text-red-800">
                  {formatNumber(step?.quantityScrap ?? 0)}
                </p>
              </div>
            </div>

            {step && (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Lot input:{' '}
                {inputLots
                  .map(
                    (lot, lotIndex) =>
                      `${lot.lotCode || `Lot ${lotIndex + 1}`} (${formatNumber(lot.availableQuantity)}pcs)`,
                  )
                  .join(', ') || 'Tidak ada stok tersisa'}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {(canRecord || allInputLotsRecorded) && (
                <button
                  type="button"
                  disabled={busy || allInputLotsRecorded}
                  onClick={() =>
                    active ? setActiveStepId(null) : openResult(step!)
                  }
                  className={`${primaryButtonClass} min-h-9 px-3 py-2 bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/20`}
                >
                  {allInputLotsRecorded
                    ? 'Semua tercatat'
                    : active
                      ? 'Tutup catat hasil'
                      : 'Catat hasil'}
                </button>
              )}
              {step &&
                step.status !== 'cancelled' &&
                ((step.outputLots ?? []).length > 0 ||
                  step.hasTransferredOutput ||
                  Number(step.quantityGood ?? 0) > 0 ||
                  finalStepOwned) &&
                (() => {
                  const alreadyTransferred = allOutputLotsSent;
                  const disabled =
                    busy ||
                    finalStepOwned ||
                    alreadyTransferred ||
                    !hasAvailableOutput;
                  return (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!hasAvailableOutput) return;
                        setTransferStepId(
                          transferStepId === step._id ? null : step._id,
                        );
                        setSelectedOperatorIds([]);
                        setTransferNotes('');
                        setError('');
                      }}
                      className={`${secondaryButtonClass} ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-70 hover:bg-slate-100' : ''}`}
                    >
                      {finalStepFinished
                        ? 'Proses selesai'
                        : finalStepOwned
                          ? 'Proses akhir'
                          : alreadyTransferred
                            ? 'Terkirim'
                            : transferStepId === step._id
                              ? 'Tutup Kirim Ke'
                              : 'Kirim Ke'}
                    </button>
                  );
                })()}
              {canCompleteStep && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (step) openResult(step, true);
                  }}
                  className={`${secondaryButtonClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}
                >
                  Selesai proses
                </button>
              )}
              {step?.status === 'completed' && !hasRemainingInput && (
                <span className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                  Proses selesai
                </span>
              )}
              {isLastWorkflowStep &&
                workflowSteps.length > 1 &&
                step?.status !== 'cancelled' &&
                (order.status === 'completed' ? (
                  <span className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                    Produksi selesai
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !canFinalizeProduction}
                    onClick={() => void handleCompleteProduction()}
                    className={`${secondaryButtonClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}
                    title={
                      canFinalizeProduction
                        ? 'Aktif setelah semua proses selesai atau dibatalkan'
                        : 'Selesaikan semua proses terlebih dahulu'
                    }
                  >
                    {busy ? 'Menyelesaikan produksi...' : 'Selesai produksi'}
                  </button>
                ))}
            </div>

            {notice && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                {notice}
              </div>
            )}
          </article>
        );
      })}

      {transferStep && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy)
              setTransferStepId(null);
          }}
        >
          <form
            onSubmit={(event) => void submitTransfer(event)}
            className="max-h-[82dvh] w-full max-w-md space-y-2.5 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-extrabold text-slate-900">
                  Kirim ke
                </p>
                <p className="text-xs text-slate-500">
                  {order.orderNumber} · {stepTitle(transferStep)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setTransferStepId(null)}
                aria-label="Tutup modal"
                className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(96px,1fr)] gap-2">
              <label className="block min-w-0 text-sm font-semibold text-slate-700">
                Lot sumber
                <select
                  disabled
                  className="mt-1.5 min-h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
                >
                  {selectedOutputLots.map((lot, i) => (
                    <option
                      key={lot._id}
                    >{`Lot ${i + 1} (${formatNumber(lot.availableQuantity)}pcs)`}</option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 text-sm font-semibold text-slate-700">
                Jumlah dikirim
                <p className="mt-1.5 flex min-h-9 items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold">
                  {formatNumber(selectedOutputLot?.availableQuantity ?? 0)} pcs
                </p>
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                  Seluruh stok lot akan dikirim.
                </span>
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">
                Operator penerima
              </p>
              {operatorsLoading ? (
                <p className="text-xs text-slate-500">
                  Memuat daftar Operator...
                </p>
              ) : (
                <div className="grid max-h-24 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
                  {operators.map((operator) => {
                    const checked = selectedOperatorIds.includes(operator._id);
                    return (
                      <label
                        key={operator._id}
                        className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
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
              )}
              <p className="text-xs font-medium text-blue-700">
                {selectedOperatorIds.length} operator dipilih
              </p>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Catatan{' '}
              <span className="font-normal text-slate-400">(opsional)</span>
              <textarea
                rows={1}
                maxLength={2000}
                value={transferNotes}
                onChange={(event) => setTransferNotes(event.target.value)}
                placeholder="Catatan pengiriman..."
                className="mt-1.5 min-h-9 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
              />
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-0.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setTransferStepId(null)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  !selectedOutputLot ||
                  selectedOperatorIds.length === 0 ||
                  selectedOutputLot.availableQuantity <
                    selectedOperatorIds.length
                }
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Mengirim...' : 'Kirim'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedStep && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy)
              setActiveStepId(null);
          }}
        >
          <form
            id={`result-form-${order._id}-${selectedStep._id}`}
            onSubmit={(event) => void submitResult(event, selectedStep)}
            className="max-h-[88dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Catat hasil
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {order.orderNumber} · {stepTitle(selectedStep)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActiveStepId(null);
                  setCompleteAfterResult(false);
                }}
                aria-label="Tutup modal"
                className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {completeAfterResult ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800">
                    Semua lot input sudah habis dan hasil proses sudah tercatat.
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Simpan untuk menandai proses selesai. Hasil tidak akan
                    dicatat ulang.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Diproses</p>
                    <p className="mt-1 font-bold text-slate-900">
                      {formatNumber(selectedStep.quantityProcessed ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Baik</p>
                    <p className="mt-1 font-bold text-emerald-800">
                      {formatNumber(selectedStep.quantityGood ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-xs text-red-700">Rusak</p>
                    <p className="mt-1 font-bold text-red-800">
                      {formatNumber(selectedStep.quantityScrap ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <label className="block min-w-0 text-sm font-semibold text-slate-700">
                  Lot input
                  <select
                    required
                    value={inputLotId || selectedInputLot?._id || ''}
                    onChange={(event) => setInputLotId(event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {selectedInputLots.map((lot, lotIndex) => (
                      <option key={lot._id} value={lot._id}>
                        {lot.lotCode || `Lot ${lotIndex + 1}`} · tersedia{' '}
                        {formatNumber(lot.availableQuantity)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <QuantityControl
                    label="Diproses"
                    min={1}
                    max={selectedInputLot?.availableQuantity ?? 0}
                    value={processedQuantity}
                    onChange={setProcessedQuantity}
                    className="bg-slate-50"
                  />
                  <QuantityControl
                    label="Baik"
                    value={goodQuantity}
                    max={Number(processedQuantity) || undefined}
                    onChange={setGoodQuantity}
                    className="bg-emerald-50"
                  />
                  <QuantityControl
                    label="Rusak"
                    value={scrapQuantity}
                    max={Number(processedQuantity) || undefined}
                    onChange={setScrapQuantity}
                    className="bg-red-50"
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Total produk baik + rusak harus sama dengan jumlah diproses.
                </p>

                <label className="block text-sm font-semibold text-slate-700">
                  Catatan (opsional)
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Catatan hasil produksi..."
                  />
                </label>
              </>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="action"
                value="save-result"
                disabled={busy || (!completeAfterResult && !selectedInputLot)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Menyimpan...' : 'Simpan hasil'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type ListFilter = 'all' | 'new' | 'in-progress' | 'completed';

type WorkForm = {
  quantity: string;
  plannedStartDate: string;
  plannedEndDate: string;
  notes: string;
};

const panelClass = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm';
const inputClass =
  'mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100';
const labelClass = 'block text-xs font-semibold text-slate-600';
const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('id-ID').format(Number(value) || 0);

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
            onClick={() =>
              onChange(
                String(
                  max === undefined ? current + 1 : Math.min(max, current + 1),
                ),
              )
            }
            className="flex h-1/2 flex-1 items-center justify-center text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            +
          </button>
          <div className="h-px w-full bg-slate-200" />
          <button
            type="button"
            aria-label={`Kurangi ${label}`}
            disabled={current <= min}
            onClick={() => onChange(String(Math.max(min, current - 1)))}
            className="flex h-1/2 flex-1 items-center justify-center text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan. Silakan coba lagi.';
}

function normalizeRequirements(response: RequirementsResponse) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && !Array.isArray(response.data)) {
    if (Array.isArray(response.data.data)) return response.data.data;
    if (Array.isArray(response.data.requirements))
      return response.data.requirements;
  }
  if (Array.isArray(response.requirements)) return response.requirements;
  throw new Error('Format respons production requirements tidak sesuai.');
}

export default function AdminProduksiPlanningPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, WorkForm>>({});
  const [busyProduct, setBusyProduct] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [recentOrders, setRecentOrders] = useState<ProductionOrder[]>([]);
  const [createdProductIds, setCreatedProductIds] = useState<string[]>([]);

  const query = useQuery<ProductionRequirement[], Error>({
    queryKey: ['production-requirements'],
    queryFn: async () =>
      normalizeRequirements(
        await apiFetch<RequirementsResponse>('/api/production-requirements'),
      ),
    refetchInterval: 60000,
  });

  const ordersQuery = useQuery<ProductionOrder[], Error>({
    queryKey: ['admin-production-orders'],
    queryFn: async () =>
      normalizeOrders(await apiFetch<OrdersResponse>('/api/production-orders')),
    refetchInterval: 60000,
    retry: 1,
  });

  const allOrders = useMemo(() => {
    const byId = new Map<string, ProductionOrder>();
    for (const order of recentOrders) byId.set(order._id, order);
    for (const order of ordersQuery.data ?? []) byId.set(order._id, order);
    return [...byId.values()];
  }, [ordersQuery.data, recentOrders]);
  const requirements = query.data ?? [];
  const matchesProductSearch = (product: ProductInfo) => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    if (!keyword) return true;
    return [product.name, product.version, product.body, product._id]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('id-ID')
      .includes(keyword);
  };

  const matchesOrderSearch = (order: ProductionOrder) => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    if (!keyword) return true;
    const product = requirements.find(
      (item) => item.product._id === orderProductId(order),
    )?.product;
    const embedded =
      typeof order.product === 'object' ? order.product : undefined;
    return [
      order.orderNumber,
      order._id,
      embedded?.name,
      embedded?.version,
      embedded?.body,
      product?.name,
      product?.version,
      product?.body,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('id-ID')
      .includes(keyword);
  };

  const newProductRequirements = useMemo(
    () =>
      requirements.filter((item) => {
        const productId = item.product._id;
        const hasOrder =
          allOrders.some((order) => orderProductId(order) === productId) ||
          createdProductIds.includes(productId);
        return (
          Number(item.productionNeed ?? 0) > 0 &&
          !hasOrder &&
          matchesProductSearch(item.product)
        );
      }),
    [requirements, allOrders, createdProductIds, search],
  );
  const filteredRequirements = newProductRequirements;
  const visibleOrders = allOrders.filter(
    (order) => order.status !== 'cancelled' && matchesOrderSearch(order),
  );
  const plannedOrders = visibleOrders.filter(
    (order) => firstProductionStep(order)?.status === 'planned',
  );
  const inProgressOrders = visibleOrders.filter((order) => {
    const firstStep = firstProductionStep(order);
    return firstStep ? isStepInProgress(firstStep) : false;
  });
  const completedOrders = visibleOrders.filter((order) => {
    const firstStep = firstProductionStep(order);
    return firstStep ? isStepCompleted(firstStep) : false;
  });

  function openWorkForm(item: ProductionRequirement) {
    setErrorMessage('');
    setNotice('');
    setActiveProduct(item.product._id);
    setForms((current) => ({
      ...current,
      [item.product._id]: {
        quantity: String(Math.max(0, Number(item.productionNeed) || 0)),
        plannedStartDate: new Date().toISOString().slice(0, 10),
        plannedEndDate: new Date().toISOString().slice(0, 10),
        notes: '',
      },
    }));
  }

  function updateForm(productId: string, patch: Partial<WorkForm>) {
    setForms((current) => ({
      ...current,
      [productId]: Object.assign(
        {
          quantity: '',
          plannedStartDate: '',
          plannedEndDate: '',
          notes: '',
        },
        current[productId],
        patch,
      ),
    }));
  }

  async function handleWork(
    event: FormEvent<HTMLFormElement>,
    item: ProductionRequirement,
  ) {
    event.preventDefault();
    const productId = item.product._id;
    const form = forms[productId];
    if (!form) return;

    const minimum = Math.max(0, Number(item.productionNeed) || 0);
    const quantity = Number(form.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < minimum || quantity < 1) {
      setErrorMessage(
        `Jumlah produksi ${item.product.name} minimal ${formatNumber(minimum)} unit sesuai Production Plan.`,
      );
      return;
    }
    if (!form.plannedStartDate || !form.plannedEndDate) {
      setErrorMessage('Tanggal mulai dan tanggal selesai wajib diisi.');
      return;
    }
    if (form.plannedEndDate < form.plannedStartDate) {
      setErrorMessage(
        'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
      );
      return;
    }

    setBusyProduct(productId);
    setErrorMessage('');
    setNotice('');
    try {
      const response = await apiFetch<CreateBatchResponse>(
        '/api/production-batches/from-requirements',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ product: productId, quantity }],
            plannedStartDate: form.plannedStartDate,
            plannedEndDate: form.plannedEndDate,
            notes: form.notes.trim(),
            // Admin Produksi langsung mengerjakan proses pertama.
            startFirstStep: true,
          }),
        },
      );

      if (response?.success === false) {
        throw new Error(response.message || 'Gagal membuat Production Order.');
      }

      setNotice(
        response?.message ||
          `Production Batch dan Production Order untuk ${item.product.name} berhasil dibuat.`,
      );
      const payload = response.data;
      const created =
        payload && typeof payload === 'object' && 'orders' in payload
          ? ((payload as { orders?: ProductionOrder[] }).orders ?? [])
          : [];
      if (created.length)
        setRecentOrders((current) => [
          ...created.map((order) => ({
            ...order,
            product: order.product ?? item.product,
          })),
          ...current,
        ]);
      setCreatedProductIds((current) =>
        current.includes(productId) ? current : [...current, productId],
      );
      setFilter('in-progress');
      setActiveProduct(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['production-requirements'],
        }),
        queryClient.invalidateQueries({ queryKey: ['unassigned-orders'] }),
        queryClient.invalidateQueries({
          queryKey: ['production-planning-unassigned-orders'],
        }),
        queryClient.invalidateQueries({ queryKey: ['production-planning'] }),
      ]);
      await Promise.all([query.refetch(), ordersQuery.refetch()]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyProduct('');
    }
  }

  const allCount = visibleOrders.length + newProductRequirements.length;
  const newCount = plannedOrders.length + newProductRequirements.length;
  const inProgressCount = inProgressOrders.length;
  const completedCount = completedOrders.length;

  const totalNeed = requirements.reduce(
    (sum, item) => sum + (Number(item.productionNeed) || 0),
    0,
  );

  return (
    <main className="min-h-dvh overflow-x-hidden bg-white px-2 py-4 text-slate-900 sm:px-3 sm:py-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="relative overflow-hidden rounded-2xl bg-white px-1 py-2">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-64 rotate-[32deg] bg-gradient-to-r from-red-600 to-blue-800 opacity-95" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#102b59] text-lg font-black text-white shadow-sm">
                FS
              </div>
              <div className="min-w-0">
                <p className="text-xl font-extrabold tracking-tight text-[#102b59]">
                  Fahrul Store
                </p>
                <h1 className="mt-0.5 text-sm font-bold text-[#101d3b]">
                  Production Planning
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Mulai produksi berdasarkan kebutuhan dari Production Plan.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                void Promise.all([query.refetch(), ordersQuery.refetch()])
              }
              disabled={query.isFetching || ordersQuery.isFetching}
              className={secondaryButtonClass}
            >
              {query.isFetching || ordersQuery.isFetching
                ? 'Memuat...'
                : 'Refresh'}
            </button>
          </div>
          <nav
            aria-label="Navigasi Admin Produksi"
            className="relative mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          >
            <Link
              href="/admin-produksi"
              aria-current="page"
              className="flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-red-600 to-blue-600 px-3 py-2 text-center text-xs font-bold text-white shadow-sm sm:text-sm"
            >
              Planning
            </Link>
            <Link
              href="/admin-produksi/create-order"
              className="flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 sm:text-sm"
            >
              Create Order
            </Link>
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">Jumlah produk</p>
              <p className="mt-0.5 text-lg font-extrabold">
                {formatNumber(requirements.length)}
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-2.5">
              <p className="text-[11px] text-red-700">
                Total kebutuhan produksi
              </p>
              <p className="mt-0.5 text-lg font-extrabold text-red-800">
                {formatNumber(totalNeed)} unit
              </p>
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}
        {query.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            Gagal memuat Production Plan: {getErrorMessage(query.error)}
          </div>
        )}

        <section className="space-y-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama produk, versi, jenis, atau ID..."
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <nav
            aria-label="Filter Production Planning"
            className="flex w-full items-center gap-3 overflow-x-auto border-b border-slate-200 px-1 sm:gap-5"
          >
            {(
              [
                ['all', 'Semua', allCount],
                ['new', 'Baru', newCount],
                ['in-progress', 'Dikerjakan', inProgressCount],
                ['completed', 'Selesai', completedCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`relative shrink-0 py-3 text-sm font-semibold transition ${
                  filter === value
                    ? 'text-blue-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {label}
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                      filter === value
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {formatNumber(count)}
                  </span>
                </span>
                {filter === value && (
                  <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-blue-700" />
                )}
              </button>
            ))}
          </nav>
          <p className="text-right text-xs text-slate-500">
            {formatNumber(
              filter === 'all'
                ? allCount
                : filter === 'new'
                  ? newCount
                  : filter === 'in-progress'
                    ? inProgressCount
                    : completedCount,
            )}{' '}
            {filter === 'new' ? 'produk baru' : 'Production Order'}
          </p>
        </section>

        {ordersQuery.isLoading && recentOrders.length === 0 ? (
          <div
            className={`${panelClass} py-10 text-center text-sm text-slate-500`}
          >
            Memuat Production Order...
          </div>
        ) : (
          <section className="space-y-4">
            {filter === 'all' && visibleOrders.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visibleOrders.map((order) => {
                  const firstStep = firstProductionStep(order);
                  return (
                    <OperatorStyleOrderCard
                      key={order._id}
                      // Menu Semua juga hanya menampilkan proses pertama.
                      // Status proses berikutnya tidak boleh muncul sebagai Direncanakan di kartu ini.
                      order={{ ...order, steps: firstStep ? [firstStep] : [] }}
                      workflowSteps={order.steps ?? []}
                      productFallback={
                        requirements.find(
                          (item) => item.product._id === orderProductId(order),
                        )?.product
                      }
                      onRefresh={() => ordersQuery.refetch()}
                    />
                  );
                })}
              </div>
            )}
            {filter === 'new' && plannedOrders.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {plannedOrders.map((order) => {
                  const firstStep = firstProductionStep(order);
                  return (
                    <OperatorStyleOrderCard
                      key={order._id}
                      order={{ ...order, steps: firstStep ? [firstStep] : [] }}
                      workflowSteps={order.steps ?? []}
                      productFallback={
                        requirements.find(
                          (item) => item.product._id === orderProductId(order),
                        )?.product
                      }
                      onRefresh={() => ordersQuery.refetch()}
                    />
                  );
                })}
              </div>
            )}
            {filter === 'in-progress' && inProgressOrders.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {inProgressOrders.map((order) => {
                  const firstStep = firstProductionStep(order);
                  if (!firstStep) return null;
                  return (
                    <OperatorStyleOrderCard
                      key={`${order._id}:${firstStep._id}`}
                      isDikerjakanMenu
                      order={{ ...order, steps: [firstStep] }}
                      workflowSteps={
                        order.steps ?? (order.step ? [order.step] : [])
                      }
                      productFallback={
                        requirements.find(
                          (item) =>
                            item.product._id === orderProductId(order),
                        )?.product
                      }
                      onRefresh={() => ordersQuery.refetch()}
                    />
                  );
                })}
              </div>
            )}
            {filter === 'completed' && completedOrders.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {completedOrders.map((order) => {
                  const firstStep = firstProductionStep(order);
                  if (!firstStep) return null;
                  return (
                    <OperatorStyleOrderCard
                      key={`${order._id}:${firstStep._id}`}
                      order={{ ...order, steps: [firstStep] }}
                      workflowSteps={
                        order.steps ?? (order.step ? [order.step] : [])
                      }
                      productFallback={
                        requirements.find(
                          (item) =>
                            item.product._id === orderProductId(order),
                        )?.product
                      }
                      onRefresh={() => ordersQuery.refetch()}
                    />
                  );
                })}
              </div>
            )}
            {(filter === 'all' || filter === 'new') &&
              newProductRequirements.length > 0 && (
                <section className="space-y-2">
                  {newProductRequirements.map((item) => {
                    const product = item.product;
                    const need = Math.max(0, Number(item.productionNeed) || 0);
                    return (
                      <article
                        key={product._id}
                        className="min-w-0 rounded-2xl border border-slate-200 border-l-4 border-l-red-600 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="break-words text-lg font-extrabold text-slate-900">
                              {product.name}
                            </h2>
                            {(product.version || product.body) && (
                              <p className="mt-1 text-xs text-slate-500">
                                {[
                                  product.version
                                    ? `Versi ${product.version}`
                                    : '',
                                  product.body ? `Jenis ${product.body}` : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            )}
                            <p className="mt-2 text-sm font-semibold text-red-700">
                              Kebutuhan produksi: {formatNumber(need)} unit
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={need <= 0 || Boolean(busyProduct)}
                            onClick={() => openWorkForm(item)}
                            className={primaryButtonClass}
                          >
                            Kerjakan
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
            {((filter === 'all' &&
              visibleOrders.length === 0 &&
              newProductRequirements.length === 0) ||
              (filter === 'new' &&
                plannedOrders.length === 0 &&
                newProductRequirements.length === 0) ||
              (filter === 'in-progress' && inProgressOrders.length === 0) ||
              (filter === 'completed' && completedOrders.length === 0)) && (
              <div
                className={`${panelClass} py-10 text-center text-sm text-slate-500`}
              >
                Tidak ada data yang sesuai pada menu ini.
              </div>
            )}
          </section>
        )}

        {activeProduct &&
          (() => {
            const item = requirements.find(
              (row) => row.product._id === activeProduct,
            );
            if (!item) return null;

            const product = item.product;
            const need = Math.max(0, Number(item.productionNeed) || 0);
            const form = forms[product._id];
            const quantity = Number(form?.quantity ?? need);
            const validQuantity =
              Number.isSafeInteger(quantity) && quantity >= Math.max(1, need);
            const isBusy = busyProduct === product._id;

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"
                onClick={(event) => {
                  if (event.target === event.currentTarget && !isBusy) {
                    setActiveProduct(null);
                    setErrorMessage('');
                  }
                }}
              >
                <form
                  onSubmit={(event) => void handleWork(event, item)}
                  className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">
                        Mulai Produksi
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {product.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setActiveProduct(null);
                        setErrorMessage('');
                      }}
                      className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                      aria-label="Tutup modal"
                    >
                      ×
                    </button>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs font-semibold text-blue-700">
                      Production Plan
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Demand</p>
                        <p className="font-bold text-slate-900">
                          {formatNumber(item.demandQuantity)} unit
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Stok tersedia</p>
                        <p className="font-bold text-emerald-700">
                          {formatNumber(item.inventory?.availableQuantity ?? 0)}{' '}
                          unit
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">
                          Produksi berjalan
                        </p>
                        <p className="font-bold text-slate-900">
                          {formatNumber(
                            item.production?.inProgressQuantity ?? 0,
                          )}{' '}
                          unit
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">
                          Production Need
                        </p>
                        <p className="font-extrabold text-red-700">
                          {formatNumber(need)} unit
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className={labelClass}>
                    Jumlah produksi
                    <input
                      required
                      type="number"
                      min={Math.max(1, need)}
                      step={1}
                      value={form?.quantity ?? String(need)}
                      onChange={(event) =>
                        updateForm(product._id, {
                          quantity: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                    <span
                      className={`mt-1 block text-xs ${validQuantity ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {validQuantity
                        ? 'Jumlah memenuhi Production Plan.'
                        : `Jumlah minimal ${formatNumber(need)} unit.`}
                    </span>
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      Tanggal mulai
                      <input
                        type="date"
                        required
                        value={form?.plannedStartDate ?? ''}
                        onChange={(event) =>
                          updateForm(product._id, {
                            plannedStartDate: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Tanggal selesai
                      <input
                        type="date"
                        required
                        min={form?.plannedStartDate || undefined}
                        value={form?.plannedEndDate ?? ''}
                        onChange={(event) =>
                          updateForm(product._id, {
                            plannedEndDate: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <label className={labelClass}>
                    Catatan (opsional)
                    <textarea
                      rows={3}
                      value={form?.notes ?? ''}
                      onChange={(event) =>
                        updateForm(product._id, { notes: event.target.value })
                      }
                      className={inputClass}
                      placeholder="Catatan produksi..."
                    />
                  </label>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setActiveProduct(null);
                        setErrorMessage('');
                      }}
                      className={secondaryButtonClass}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isBusy || !validQuantity}
                      className={primaryButtonClass}
                    >
                      {isBusy
                        ? 'Membuat Production Order...'
                        : 'Konfirmasi Kerjakan'}
                    </button>
                  </div>
                </form>
              </div>
            );
          })()}
      </div>
    </main>
  );
}
