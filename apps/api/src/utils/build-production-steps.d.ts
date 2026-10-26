import mongoose from 'mongoose';
export declare class WorkflowValidationError extends Error {
    constructor(message: string);
}
type PopulatedProcess = {
    _id: mongoose.Types.ObjectId;
    name: string;
    code: string;
};
type WorkflowItem = {
    process: PopulatedProcess | null;
    sequence: number;
    dependsOn?: number[];
};
export declare function buildProductionSteps(workflow: WorkflowItem[]): {
    _id: mongoose.Types.ObjectId;
    process: mongoose.Types.ObjectId;
    processName: string;
    processCode: string;
    sequence: number;
    dependsOn: mongoose.Types.ObjectId[];
    status: "planned";
    quantityProcessed: number;
    quantityGood: number;
    quantityScrap: number;
    startedAt: null;
    completedAt: null;
    notes: string;
}[];
export {};
//# sourceMappingURL=build-production-steps.d.ts.map