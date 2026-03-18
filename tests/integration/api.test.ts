// Tests de integración básicos para la API
// Nota: Tests completos requieren base de datos de test

describe('API Health', () => {
  it('GET /health debe responder', async () => {
    const response = await fetch('http://localhost:3000/health');
    const data: any = await response.json();
    
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });
});

describe('API Structure', () => {
  it('El servidor debe estar corriendo', async () => {
    const response = await fetch('http://localhost:3000/health');
    expect(response.ok).toBe(true);
  });
});
