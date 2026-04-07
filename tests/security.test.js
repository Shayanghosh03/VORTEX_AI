const request = require('supertest');
const app = require('../app');

describe('Security Headers', () => {
  test('should have X-Content-Type-Options header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('should not expose X-Powered-By header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('should have X-Frame-Options header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('NoSQL Injection Protection', () => {
  test('should sanitize mongo operators in body and not grant access', async () => {
    // express-mongo-sanitize strips $gt — the route receives empty objects,
    // fails validation, and re-renders the login page instead of redirecting to /
    const res = await request(app)
      .post('/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });
    // A successful login redirects (302) to /; any other status means injection was blocked
    expect(res.status).not.toBe(302);
  });
});

describe('Auth Protection', () => {
  test('should redirect to login if not authenticated on /damage-model', async () => {
    const res = await request(app).get('/damage-model');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('should redirect to login if not authenticated on /risk-map', async () => {
    const res = await request(app).get('/risk-map');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('should redirect to login if not authenticated on /reports', async () => {
    const res = await request(app).get('/reports');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('Environment Variables', () => {
  test('SESSION_SECRET should be set', () => {
    expect(process.env.SESSION_SECRET).toBeDefined();
  });

  test('MONGO_URL should be set', () => {
    expect(process.env.MONGO_URL).toBeDefined();
  });
});

// Rate limiting runs last with an isolated app instance so the 110 requests
// don't exhaust the shared limiter used by the other describe blocks above.
describe('Rate Limiting', () => {
  let isolatedApp;

  beforeAll(() => {
    jest.isolateModules(() => {
      isolatedApp = require('../app');
    });
  });

  test('should return 429 after too many requests', async () => {
    const agent = request(isolatedApp);
    const requests = Array.from({ length: 110 }, () => agent.get('/'));
    const responses = await Promise.all(requests);
    const blocked = responses.filter(r => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  const mongoose = require('mongoose');
  await mongoose.connection.close();
});
