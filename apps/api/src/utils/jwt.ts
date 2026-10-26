import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET ?? '';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}

export interface JwtPayload {
  userId: string;
  role: string;
}

export function generateAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1d',
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
