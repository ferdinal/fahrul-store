import type { NextFunction, Request, Response } from 'express';
export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}
export declare function authenticate(req: AuthRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireRole(role: string): (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.middleware.d.ts.map