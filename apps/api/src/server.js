import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { connectDatabase } from '@fahrul-store/database';
// import userRoutes from '';
import userRoutes from './routes/user.routes.js';
import authRoutes from './routes/auth.routes.js';
import productsRouter from './routes/products.routes.js';
import productionProcessesRouter from './routes/production-processes.routes.js';
import productionBatchesRouter from './routes/production-batches.routes.js';
import productionOrdersRouter from './routes/production-orders.routes.js';
import inventoryRouter from './routes/inventory.routes.js';
import customerOrdersRouter from './routes/customer-orders.routes.js';
import productionRequirementsRoutes from './routes/production-requirements.routes.js';
import myCustomerOrdersRouter from './routes/my-customer-orders.routes.js';
const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => {
    res.json({
        success: true,
        message: 'Fahrul Store API is running',
    });
});
const PORT = process.env.PORT || 4000;
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productsRouter);
app.use('/api/production-processes', productionProcessesRouter);
app.use('/api/production-batches', productionBatchesRouter);
app.use('/api/production-orders', productionOrdersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/customer-orders', customerOrdersRouter);
app.use('/api/production-requirements', productionRequirementsRoutes);
app.use('/api/my-customer-orders', myCustomerOrdersRouter);
async function bootstrap() {
    try {
        await connectDatabase();
        app.listen(PORT, () => {
            console.log(`API running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start API:', error);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=server.js.map