import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;

    app.use(express.json({ limit: '100mb' }));
    app.use(express.urlencoded({ extended: true, limit: '100mb' }));

    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distDir = path.resolve(__dirname, 'dist');
        app.use(express.static(distDir));
        app.use((req, res, next) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                return next();
            }
            res.sendFile(path.join(distDir, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
}

startServer();
