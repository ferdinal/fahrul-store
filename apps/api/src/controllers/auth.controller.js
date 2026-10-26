import bcrypt from 'bcryptjs';
import { User } from '@fahrul-store/database';
import { generateAccessToken } from '../utils/jwt.js';
import { authenticate, } from '../middlewares/auth.middleware.js';
export async function me(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        return res.json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get current user',
        });
    }
}
export async function login(req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'username and password are required',
            });
        }
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
            });
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
            });
        }
        const accessToken = generateAccessToken({
            userId: user._id.toString(),
            role: user.role,
        });
        return res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                },
                accessToken,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to login',
        });
    }
}
//# sourceMappingURL=auth.controller.js.map