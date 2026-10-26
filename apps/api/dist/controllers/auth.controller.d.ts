import type { Request, Response } from 'express';
import { type AuthRequest } from '../middlewares/auth.middleware.js';
export declare function me(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.controller.d.ts.map