import { Router } from 'express';
const router = Router();
import { login, me } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
// const router = Router();
router.post('/login', login);
router.get('/me', authenticate, me);
export default router;
//# sourceMappingURL=auth.routes.js.map