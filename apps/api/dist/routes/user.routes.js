import { Router } from 'express';
const router = Router();
import { createUser, deleteUser, getUserById, getUsers, updateUser, } from '../controllers/user.controller.js';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
// const router: ExpressRouter = Router();
router.use(authenticate, requireAdmin);
router.post('/', createUser);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
export default router;
//# sourceMappingURL=user.routes.js.map