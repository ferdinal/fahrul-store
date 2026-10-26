import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
}
export function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: '1d',
    });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
}
//# sourceMappingURL=jwt.js.map