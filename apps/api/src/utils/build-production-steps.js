import mongoose from 'mongoose';
export class WorkflowValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WorkflowValidationError';
    }
}
export function buildProductionSteps(workflow) {
    if (workflow.length === 0) {
        throw new WorkflowValidationError('Workflow product belum dikonfigurasi.');
    }
    const sortedWorkflow = [...workflow].sort((a, b) => a.sequence - b.sequence);
    const sequenceMap = new Map();
    // Validasi sequence dan proses yang sudah di-populate.
    for (const item of sortedWorkflow) {
        if (!Number.isInteger(item.sequence) || item.sequence < 1) {
            throw new WorkflowValidationError('Sequence workflow harus berupa bilangan bulat positif.');
        }
        if (sequenceMap.has(item.sequence)) {
            throw new WorkflowValidationError(`Sequence ${item.sequence} digunakan lebih dari satu proses.`);
        }
        if (!item.process ||
            !item.process._id ||
            !item.process.name ||
            !item.process.code) {
            throw new WorkflowValidationError(`Proses pada sequence ${item.sequence} tidak ditemukan atau tidak valid.`);
        }
        sequenceMap.set(item.sequence, item);
    }
    // Workflow lama tanpa dependsOn tetap berjalan berurutan.
    // dependsOn: [] berarti tidak memiliki prasyarat.
    const dependencies = new Map();
    for (let index = 0; index < sortedWorkflow.length; index++) {
        const item = sortedWorkflow[index];
        const dependencySequences = item.dependsOn === undefined
            ? index > 0
                ? [sortedWorkflow[index - 1].sequence]
                : []
            : item.dependsOn;
        if (new Set(dependencySequences).size !== dependencySequences.length) {
            throw new WorkflowValidationError(`Dependensi sequence ${item.sequence} tidak boleh duplikat.`);
        }
        for (const dependencySequence of dependencySequences) {
            if (!Number.isInteger(dependencySequence) ||
                !sequenceMap.has(dependencySequence)) {
                throw new WorkflowValidationError(`Dependensi sequence ${dependencySequence} pada sequence ${item.sequence} tidak ditemukan.`);
            }
            if (dependencySequence === item.sequence) {
                throw new WorkflowValidationError(`Sequence ${item.sequence} tidak boleh bergantung pada dirinya sendiri.`);
            }
        }
        dependencies.set(item.sequence, dependencySequences);
    }
    // Deteksi siklus dependensi.
    const visiting = new Set();
    const visited = new Set();
    function visit(sequence) {
        if (visiting.has(sequence)) {
            throw new WorkflowValidationError('Workflow memiliki siklus dependensi.');
        }
        if (visited.has(sequence)) {
            return;
        }
        visiting.add(sequence);
        for (const dependency of dependencies.get(sequence) ?? []) {
            visit(dependency);
        }
        visiting.delete(sequence);
        visited.add(sequence);
    }
    for (const item of sortedWorkflow) {
        visit(item.sequence);
    }
    // Buat ID step terlebih dahulu agar dependensi bisa
    // mengarah ke ObjectId step dalam Production Order.
    const stepIds = new Map();
    for (const item of sortedWorkflow) {
        stepIds.set(item.sequence, new mongoose.Types.ObjectId());
    }
    return sortedWorkflow.map((item) => ({
        _id: stepIds.get(item.sequence),
        process: item.process._id,
        processName: item.process.name,
        processCode: item.process.code,
        sequence: item.sequence,
        dependsOn: (dependencies.get(item.sequence) ?? []).map((sequence) => stepIds.get(sequence)),
        status: 'planned',
        quantityProcessed: 0,
        quantityGood: 0,
        quantityScrap: 0,
        startedAt: null,
        completedAt: null,
        notes: '',
    }));
}
//# sourceMappingURL=build-production-steps.js.map