// Tests de integración básicos para la API
import request from 'supertest';
import express, { Express, Request, Response } from 'express';

// Crear app mínima para test (sin base de datos)
const app: Express = express();
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

describe('API Health', () => {
  it('GET /health debe responder', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });
});
