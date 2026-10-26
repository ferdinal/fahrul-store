export interface JwtPayload {
    userId: string;
    role: string;
}
export declare function generateAccessToken(payload: JwtPayload): string;
export declare function verifyAccessToken(token: string): JwtPayload;
//# sourceMappingURL=jwt.d.ts.map