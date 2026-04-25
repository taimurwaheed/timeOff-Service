import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { SyncLog, SyncType } from '../entities/sync-log.entity';
import { User, UserRole } from '../entities/user.entity';
import { HcmMockService } from '../hcm-mock/hcm-mock.service';

const adminUser = { userId: 'admin-1', email: 'admin@test.com', role: UserRole.ADMIN };

const mockBalance = (overrides = {}): any => ({
    id: 'bal-1',
    userId: 'emp-1',
    locationId: 'LOC001',
    balance: 10,
    version: 1,
    ...overrides,
});

const mockRequest = (overrides = {}): any => ({
    id: 'req-1',
    userId: 'emp-1',
    locationId: 'LOC001',
    daysRequested: 8,
    status: RequestStatus.PENDING,
    ...overrides,
});

const mockQueryBuilder = (affected = 1) => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
});

describe('SyncService', () => {
    let service: SyncService;
    let balanceRepo: any;
    let requestRepo: any;
    let syncLogRepo: any;
    let hcmMockService: any;

    beforeEach(async () => {
        balanceRepo = {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(),
        };
        requestRepo = { find: jest.fn(), save: jest.fn() };
        syncLogRepo = { save: jest.fn(), find: jest.fn() };
        hcmMockService = { getBalance: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SyncService,
                { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
                { provide: getRepositoryToken(TimeOffRequest), useValue: requestRepo },
                { provide: getRepositoryToken(SyncLog), useValue: syncLogRepo },
                { provide: getRepositoryToken(User), useValue: {} },
                { provide: HcmMockService, useValue: hcmMockService },
            ],
        }).compile();

        service = module.get<SyncService>(SyncService);
    });

    describe('realtimeSync', () => {
        it('updates local balance when HCM has a different value', async () => {
            hcmMockService.getBalance.mockReturnValue({ balance: 15 });
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 10 }));
            balanceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(1));
            syncLogRepo.save.mockResolvedValue({});
            requestRepo.find.mockResolvedValue([]);

            const result = await service.realtimeSync(adminUser, 'emp-1', 'LOC001');

            expect(balanceRepo.createQueryBuilder).toHaveBeenCalled();
            expect(syncLogRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ type: SyncType.REALTIME, newBalance: 15 }),
            );
            expect(result.newBalance).toBe(15);
            expect(result.previousBalance).toBe(10);
        });

        it('is a no-op when HCM balance matches local', async () => {
            hcmMockService.getBalance.mockReturnValue({ balance: 10 });
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 10 }));

            const result = await service.realtimeSync(adminUser, 'emp-1', 'LOC001');

            expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
            expect(syncLogRepo.save).not.toHaveBeenCalled();
            expect(result.requestsFailed).toBe(0);
        });

        it('marks pending requests as FAILED when new balance is lower than daysRequested', async () => {
            hcmMockService.getBalance.mockReturnValue({ balance: 3 });
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 10 }));
            balanceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(1));
            syncLogRepo.save.mockResolvedValue({});
            requestRepo.find.mockResolvedValue([mockRequest({ daysRequested: 8 })]);
            requestRepo.save.mockResolvedValue({});

            const result = await service.realtimeSync(adminUser, 'emp-1', 'LOC001');

            expect(requestRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: RequestStatus.FAILED }),
            );
            expect(result.requestsFailed).toBe(1);
        });
    });

    describe('batchSync', () => {
        it('returns correct summary for one updated and one unchanged', async () => {
            balanceRepo.findOne
                .mockResolvedValueOnce(mockBalance({ balance: 10 }))
                .mockResolvedValueOnce(mockBalance({ balance: 15 }));
            balanceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(1));
            syncLogRepo.save.mockResolvedValue({});
            requestRepo.find.mockResolvedValue([]);

            const result = await service.batchSync(adminUser, [
                { userId: 'emp-1', locationId: 'LOC001', balance: 12 },
                { userId: 'emp-2', locationId: 'LOC001', balance: 15 },
            ]);

            expect(result.updated).toBe(1);
            expect(result.unchanged).toBe(1);
            expect(result.requestsFailed).toBe(0);
        });

        it('marks pending requests as FAILED when batch lowers balance', async () => {
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 10 }));
            balanceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(1));
            syncLogRepo.save.mockResolvedValue({});
            requestRepo.find.mockResolvedValue([mockRequest({ daysRequested: 8 })]);
            requestRepo.save.mockResolvedValue({});

            const result = await service.batchSync(adminUser, [
                { userId: 'emp-1', locationId: 'LOC001', balance: 3 },
            ]);

            expect(result.requestsFailed).toBe(1);
            expect(requestRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: RequestStatus.FAILED }),
            );
        });

        it('logs every changed balance to SyncLog', async () => {
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 10 }));
            balanceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(1));
            syncLogRepo.save.mockResolvedValue({});
            requestRepo.find.mockResolvedValue([]);

            await service.batchSync(adminUser, [
                { userId: 'emp-1', locationId: 'LOC001', balance: 12 },
                { userId: 'emp-2', locationId: 'LOC001', balance: 14 },
            ]);

            expect(syncLogRepo.save).toHaveBeenCalledTimes(2);
            expect(syncLogRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ type: SyncType.BATCH }),
            );
        });
    });
});