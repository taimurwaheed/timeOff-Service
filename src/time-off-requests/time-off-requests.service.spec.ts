import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TimeOffRequestsService } from './time-off-requests.service';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User, UserRole } from '../entities/user.entity';
import { SyncLog } from '../entities/sync-log.entity';
import { HcmMockService } from '../hcm-mock/hcm-mock.service'; // ADD THIS

const mockEmployee = (overrides = {}): any => ({
    id: 'emp-1',
    managerId: 'mgr-1',
    locationId: 'LOC001',
    ...overrides,
});

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
    daysRequested: 3,
    startDate: '2026-05-01',
    endDate: '2026-05-03',
    status: RequestStatus.PENDING,
    ...overrides,
});

describe('TimeOffRequestsService', () => {
    let service: TimeOffRequestsService;
    let requestRepo: any;
    let balanceRepo: any;
    let userRepo: any;
    let syncLogRepo: any;

    beforeEach(async () => {
        requestRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
        balanceRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
        userRepo = { find: jest.fn(), findOne: jest.fn() };
        syncLogRepo = { save: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TimeOffRequestsService,
                { provide: getRepositoryToken(TimeOffRequest), useValue: requestRepo },
                { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
                { provide: getRepositoryToken(SyncLog), useValue: syncLogRepo },
                { provide: HcmMockService, useValue: { adjust: jest.fn() } }, // ADD THIS

            ],
        }).compile();

        service = module.get<TimeOffRequestsService>(TimeOffRequestsService);
    });

    describe('createRequest', () => {
        it('creates a request when balance is sufficient', async () => {
            balanceRepo.findOne.mockResolvedValue(mockBalance());
            const created = mockRequest();
            requestRepo.create.mockReturnValue(created);
            requestRepo.save.mockResolvedValue(created);

            const result = await service.createRequest(
                { userId: 'emp-1', locationId: 'LOC001' },
                { startDate: '2026-05-01', endDate: '2026-05-03', daysRequested: 3 },
            );
            expect(result.status).toBe(RequestStatus.PENDING);
        });

        it('throws 400 when balance is insufficient', async () => {
            balanceRepo.findOne.mockResolvedValue(mockBalance({ balance: 2 }));

            await expect(
                service.createRequest(
                    { userId: 'emp-1', locationId: 'LOC001' },
                    { startDate: '2026-05-01', endDate: '2026-05-03', daysRequested: 3 },
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws 400 when no balance record found', async () => {
            balanceRepo.findOne.mockResolvedValue(null);

            await expect(
                service.createRequest(
                    { userId: 'emp-1', locationId: 'LOC001' },
                    { startDate: '2026-05-01', endDate: '2026-05-03', daysRequested: 3 },
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('approveRequest', () => {
        it('manager approves request from their team — status becomes COMMITTED', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest());
            userRepo.findOne.mockResolvedValue(mockEmployee({ managerId: 'mgr-1' }));
            balanceRepo.findOne.mockResolvedValue(mockBalance());

            const qb = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 1 }),
            };
            balanceRepo.createQueryBuilder.mockReturnValue(qb);
            syncLogRepo.save.mockResolvedValue({});

            const committed = mockRequest({ status: RequestStatus.COMMITTED });
            requestRepo.save.mockResolvedValue(committed);

            const result = await service.approveRequest(
                { userId: 'mgr-1', role: UserRole.MANAGER, email: 'mgr@test.com' },
                'req-1',
            );
            expect(result.status).toBe(RequestStatus.COMMITTED);
        });

        it('manager cannot approve request outside their team', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest());
            userRepo.findOne.mockResolvedValue(mockEmployee({ managerId: 'other-mgr' }));

            await expect(
                service.approveRequest(
                    { userId: 'mgr-1', role: UserRole.MANAGER, email: 'mgr@test.com' },
                    'req-1',
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('throws 400 on optimistic lock conflict', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest());
            userRepo.findOne.mockResolvedValue(mockEmployee({ managerId: 'mgr-1' }));
            balanceRepo.findOne.mockResolvedValue(mockBalance());

            const qb = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 0 }),
            };
            balanceRepo.createQueryBuilder.mockReturnValue(qb);

            await expect(
                service.approveRequest(
                    { userId: 'mgr-1', role: UserRole.MANAGER, email: 'mgr@test.com' },
                    'req-1',
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws 400 when approving an already committed request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.COMMITTED }));

            await expect(
                service.approveRequest(
                    { userId: 'mgr-1', role: UserRole.MANAGER, email: 'mgr@test.com' },
                    'req-1',
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws 404 when request does not exist', async () => {
            requestRepo.findOne.mockResolvedValue(null);

            await expect(
                service.approveRequest(
                    { userId: 'mgr-1', role: UserRole.MANAGER, email: 'mgr@test.com' },
                    'ghost-req',
                ),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('rejectRequest', () => {
        it('rejects a pending request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest());
            userRepo.findOne.mockResolvedValue(mockEmployee({ managerId: 'mgr-1' }));
            const rejected = mockRequest({ status: RequestStatus.REJECTED });
            requestRepo.save.mockResolvedValue(rejected);

            const result = await service.rejectRequest(
                { userId: 'mgr-1', role: UserRole.MANAGER },
                'req-1',
            );
            expect(result.status).toBe(RequestStatus.REJECTED);
        });

        it('throws 400 when rejecting a non-pending request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.COMMITTED }));

            await expect(
                service.rejectRequest(
                    { userId: 'mgr-1', role: UserRole.MANAGER },
                    'req-1',
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('cancelRequest', () => {
        it('employee can cancel their own pending request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest());
            const cancelled = mockRequest({ status: RequestStatus.CANCELLED });
            requestRepo.save.mockResolvedValue(cancelled);

            const result = await service.cancelRequest(
                { userId: 'emp-1' },
                'req-1',
            );
            expect(result.status).toBe(RequestStatus.CANCELLED);
        });

        it('throws 403 when cancelling another users request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest({ userId: 'emp-2' }));

            await expect(
                service.cancelRequest({ userId: 'emp-1' }, 'req-1'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('throws 400 when cancelling a non-pending request', async () => {
            requestRepo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.COMMITTED }));

            await expect(
                service.cancelRequest({ userId: 'emp-1' }, 'req-1'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});