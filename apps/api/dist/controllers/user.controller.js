import bcrypt from 'bcryptjs';
import { User } from '@fahrul-store/database';
export async function createUser(req, res) {
    try {
        const { username, password, email, role } = req.body;
        if (!username || !password || !email) {
            return res.status(400).json({
                success: false,
                message: 'username, password, and email are required',
            });
        }
        const existingUser = await User.findOne({
            $or: [{ username }, { email }],
        });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Username or email already exists',
            });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            username,
            password: hashedPassword,
            email,
            role: role || 'user',
        });
        return res.status(201).json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create user',
        });
    }
}
export async function getUsers(_req, res) {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        return res.json({
            success: true,
            data: users,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get users',
        });
    }
}
export async function getUserById(req, res) {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        return res.json({
            success: true,
            data: user,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(400).json({
            success: false,
            message: 'Invalid user ID',
        });
    }
}
export async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { username, email, password, role } = req.body;
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            });
        }
        if (username !== undefined) {
            user.username = username;
        }
        if (email !== undefined) {
            user.email = email;
        }
        if (role !== undefined) {
            user.role = role;
        }
        // Password hanya diubah kalau dikirim
        if (password && password.trim() !== '') {
            user.password = await bcrypt.hash(password, 10);
        }
        await user.save();
        return res.json({
            message: 'User updated successfully',
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    }
    catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json({
            message: 'Failed to update user',
        });
    }
}
export async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        if (req.user?.userId === id) {
            return res.status(400).json({
                message: 'You cannot delete your own account',
            });
        }
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            });
        }
        await User.findByIdAndDelete(id);
        return res.json({
            message: 'User deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({
            message: 'Failed to delete user',
        });
    }
}
//# sourceMappingURL=user.controller.js.map