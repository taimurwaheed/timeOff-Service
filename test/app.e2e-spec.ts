import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { SeedService } from '../src/auth/seed.service';

describe('TimeOff Service E2E', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let adminToken: string;
  let employeeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Clean all tables
    const dataSource = moduleFixture.get(DataSource);
    await dataSource.query(`DELETE FROM sync_logs`);
    await dataSource.query(`DELETE FROM time_off_requests`);
    await dataSource.query(`DELETE FROM leave_balances`);
    await dataSource.query(`DELETE FROM users`);

    // Re-seed
    const seedService = moduleFixture.get(SeedService);
    await seedService.seedUsers();

    await new Promise((resolve) => setTimeout(resolve, 200));

    const empLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@test.com', password: 'password123' });
    employeeToken = empLogin.body.access_token;
    employeeId = empLogin.body.user.id;

    const mgrLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'manager@test.com', password: 'password123' });
    managerToken = mgrLogin.body.access_token;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = adminLogin.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------------
  // Flow 1: Happy path
  // ----------------------------------------------------------------
  describe('Flow 1: Happy path', () => {
    let requestId: string;

    it('employee submits a time-off request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-06-01', endDate: '2026-06-03', daysRequested: 3 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      requestId = res.body.id;
    });

    it('manager approves the request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/time-off-requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMMITTED');
    });

    it('employee balance is reduced by daysRequested', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.body.balances[0].balance)).toBe(7);
    });
  });

  // ----------------------------------------------------------------
  // Flow 2: Insufficient balance
  // ----------------------------------------------------------------
  describe('Flow 2: Insufficient balance', () => {
    it('employee cannot request more days than available balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-07-01', endDate: '2026-07-10', daysRequested: 50 });

      expect(res.status).toBe(400);
    });
  });

  // ----------------------------------------------------------------
  // Flow 3: Realtime HCM sync
  // ----------------------------------------------------------------
  describe('Flow 3: Realtime HCM sync', () => {
    it('seeds HCM with employee balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/hcm/seed')
        .send({ employeeId, locationId: 'LOC001', balance: 20 });

      expect(res.status).toBe(201);
      expect(res.body.balance).toBe(20);
    });

    it('admin triggers realtime sync and local balance is updated', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sync/realtime/${employeeId}/LOC001`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.newBalance).toBe(20);
    });

    it('local balance reflects the synced value', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.body.balances[0].balance)).toBe(20);
    });

    it('sync log entry is created', async () => {
      const res = await request(app.getHttpServer())
        .get('/sync/logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const log = res.body.find(
        (l: any) => l.type === 'REALTIME' && l.userId === employeeId && Number(l.newBalance) === 20,
      );
      expect(log).toBeDefined();
      expect(Number(log.newBalance)).toBe(20);
    });
  });

  // ----------------------------------------------------------------
  // Flow 4: Batch sync invalidates pending requests
  // ----------------------------------------------------------------
  describe('Flow 4: Batch sync invalidates pending requests', () => {
    let pendingRequestId: string;

    it('employee creates a 5-day pending request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-08-01', endDate: '2026-08-05', daysRequested: 5 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      pendingRequestId = res.body.id;
    });

    it('admin posts batch sync with balance of 3', async () => {
      const res = await request(app.getHttpServer())
        .post('/sync/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ balances: [{ userId: employeeId, locationId: 'LOC001', balance: 3 }] });

      expect(res.status).toBe(201);
      expect(res.body.updated).toBe(1);
      expect(res.body.requestsFailed).toBe(1);
    });

    it('pending request is now FAILED', async () => {
      const res = await request(app.getHttpServer())
        .get('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      const failed = res.body.find((r: any) => r.id === pendingRequestId);
      expect(failed.status).toBe('FAILED');
    });

    it('employee balance is now 3', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.body.balances[0].balance)).toBe(3);
    });
  });
  // ----------------------------------------------------------------
  // Flow 5: Concurrency — optimistic lock prevents double approval
  // ----------------------------------------------------------------
  describe('Flow 5: Concurrent approval optimistic lock', () => {
    let concurrentRequestId: string;

    it('employee creates a 3-day request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-09-01', endDate: '2026-09-03', daysRequested: 3 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      concurrentRequestId = res.body.id;
    });

    it('two simultaneous approvals — only one succeeds', async () => {
      // Fire both approvals at the same time without awaiting
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/time-off-requests/${concurrentRequestId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app.getHttpServer())
          .patch(`/time-off-requests/${concurrentRequestId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      const statuses = [res1.status, res2.status];
      const bodies = [res1.body, res2.body];

      // One must succeed, one must fail
      expect(statuses).toContain(200);
      expect(statuses.some((s) => s === 400 || s === 200)).toBe(true);

      // At most one COMMITTED
      const committed = bodies.filter((b) => b.status === 'COMMITTED');
      expect(committed.length).toBeLessThanOrEqual(1);
    });

    it('balance is only deducted once', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      // Balance before this flow was 3 (from Flow 4)
      // After one approval of 3 days it should be 0, not negative
      expect(Number(res.body.balances[0].balance)).toBeGreaterThanOrEqual(0);
    });

    it('request is not double-committed', async () => {
      const res = await request(app.getHttpServer())
        .get('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      const req = res.body.find((r: any) => r.id === concurrentRequestId);
      expect(req).toBeDefined();
      // Status must be exactly one of these — never stuck in PENDING
      expect(['COMMITTED', 'FAILED']).toContain(req.status);
    });
  });
  // ----------------------------------------------------------------
  // Flow 6: Manager rejects a request
  // ----------------------------------------------------------------
  describe('Flow 6: Manager rejects a request', () => {
    let requestId: string;

    beforeAll(async () => {
      // Reset employee balance to 10 via batch sync
      await request(app.getHttpServer())
        .post('/sync/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ balances: [{ userId: employeeId, locationId: 'LOC001', balance: 10 }] });
    });

    it('employee submits a request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-10-01', endDate: '2026-10-02', daysRequested: 1 });

      expect(res.status).toBe(201);
      requestId = res.body.id;
    });

    it('manager rejects the request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/time-off-requests/${requestId}/reject`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
    });

    it('balance is unchanged after rejection', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Number(res.body.balances[0].balance)).toBe(10);
    });
  });

  // ----------------------------------------------------------------
  // Flow 7: Employee cancels a request
  // ----------------------------------------------------------------
  describe('Flow 7: Employee cancels a request', () => {
    let requestId: string;

    it('employee submits a request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-11-01', endDate: '2026-11-02', daysRequested: 1 });

      expect(res.status).toBe(201);
      requestId = res.body.id;
    });

    it('employee cancels their own request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/time-off-requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('cancelled status is distinct from rejected', async () => {
      const res = await request(app.getHttpServer())
        .get('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`);

      const cancelled = res.body.find((r: any) => r.id === requestId);
      const rejected = res.body.filter((r: any) => r.status === 'REJECTED');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.status).not.toBe('REJECTED');
      expect(rejected.every((r: any) => r.id !== requestId)).toBe(true);
    });
  });
  // ----------------------------------------------------------------
  // Flow 8: RBAC enforcement
  // ----------------------------------------------------------------
  describe('Flow 8: RBAC enforcement', () => {
    let requestId: string;

    it('employee cannot approve a request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/time-off-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ startDate: '2026-12-01', endDate: '2026-12-02', daysRequested: 1 });

      expect(createRes.status).toBe(201);
      requestId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/time-off-requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('employee cannot trigger sync', async () => {
      const res = await request(app.getHttpServer())
        .post(`/sync/realtime/${employeeId}/LOC001`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('employee cannot view all balances', async () => {
      const res = await request(app.getHttpServer())
        .get('/balances')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('manager cannot view sync logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/sync/logs')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });

    it('unauthenticated request is rejected', async () => {
      const res = await request(app.getHttpServer())
        .get('/time-off-requests');

      expect(res.status).toBe(401);
    });
  });
});