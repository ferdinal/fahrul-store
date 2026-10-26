import type { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '../utils/jwt.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header is required',
      });
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization format',
      });
    }

    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
}

export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `${role} access required`,
      });
    }

    next();
  };
}
