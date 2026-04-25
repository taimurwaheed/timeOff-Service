import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User, UserRole } from '../entities/user.entity';

const mockUser = (overrides = {}): any => ({
    id: 'user-1',
    name: 'Test User',
    managerId: null,
    locationId: 'LOC001',
    ...overrides,
});

const mockBalance = (overrides = {}): any => ({
    id: 'bal-1',
    userId: 'user-1',
    locationId: 'LOC001',
    balance: 10,
    version: 1,
    ...overrides,
});

describe('BalancesService', () => {
    let service: BalancesService;
    let userRepo: any;
    let balanceRepo: any;

    beforeEach(async () => {
        userRepo = { findOne: jest.fn() };
        balanceRepo = { find: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BalancesService,
                { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
            ],
        }).compile();

        service = module.get<BalancesService>(BalancesService);
    });

    describe('getBalance', () => {
        it('employee can fetch their own balance', async () => {
            userRepo.findOne.mockResolvedValue(mockUser());
            balanceRepo.find.mockResolvedValue([mockBalance()]);

            const result = await service.getBalance(
                { userId: 'user-1', role: UserRole.EMPLOYEE },
                'user-1',
            );
            expect(result.userId).toBe('user-1');
            expect(result.balances).toHaveLength(1);
        });

        it('employee cannot fetch another users balance', async () => {
            userRepo.findOne.mockResolvedValue(mockUser({ id: 'user-2' }));

            await expect(
                service.getBalance(
                    { userId: 'user-1', role: UserRole.EMPLOYEE },
                    'user-2',
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('manager can fetch their own balance', async () => {
            userRepo.findOne.mockResolvedValue(mockUser({ id: 'manager-1' }));
            balanceRepo.find.mockResolvedValue([mockBalance({ userId: 'manager-1' })]);

            const result = await service.getBalance(
                { userId: 'manager-1', role: UserRole.MANAGER },
                'manager-1',
            );
            expect(result.userId).toBe('manager-1');
        });

        it('manager can fetch their direct reports balance', async () => {
            userRepo.findOne.mockResolvedValue(mockUser({ id: 'user-2', managerId: 'manager-1' }));
            balanceRepo.find.mockResolvedValue([mockBalance({ userId: 'user-2' })]);

            const result = await service.getBalance(
                { userId: 'manager-1', role: UserRole.MANAGER },
                'user-2',
            );
            expect(result.userId).toBe('user-2');
        });

        it('manager cannot fetch balance of employee outside their team', async () => {
            userRepo.findOne.mockResolvedValue(mockUser({ id: 'user-2', managerId: 'other-manager' }));

            await expect(
                service.getBalance(
                    { userId: 'manager-1', role: UserRole.MANAGER },
                    'user-2',
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('admin can fetch any users balance', async () => {
            userRepo.findOne.mockResolvedValue(mockUser({ id: 'user-2' }));
            balanceRepo.find.mockResolvedValue([mockBalance({ userId: 'user-2' })]);

            const result = await service.getBalance(
                { userId: 'admin-1', role: UserRole.ADMIN },
                'user-2',
            );
            expect(result.userId).toBe('user-2');
        });

        it('returns 404 for non-existent user', async () => {
            userRepo.findOne.mockResolvedValue(null);

            await expect(
                service.getBalance(
                    { userId: 'admin-1', role: UserRole.ADMIN },
                    'ghost-user',
                ),
            ).rejects.toThrow(NotFoundException);
        });
    });
});