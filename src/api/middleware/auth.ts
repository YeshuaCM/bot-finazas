import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Disabled when no API key is configured (backward compatibility)
  if (!config.api.apiKey) {
    next();
    return;
  }

  const key = req.headers['x-api-key'] as string | undefined;
  if (!key) {
    res.status(401).json({ error: 'Unauthorized: missing API key' });
    return;
  }
  if (key !== config.api.apiKey) {
    res.status(403).json({ error: 'Forbidden: invalid API key' });
    return;
  }

  next();
}
