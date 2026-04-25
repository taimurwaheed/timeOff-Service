import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { SyncLog, SyncType } from '../entities/sync-log.entity';
import { UserRole } from '../entities/user.entity';
import { HcmMockService } from '../hcm-mock/hcm-mock.service';

@Injectable()
export class SyncService {
    constructor(
        @InjectRepository(LeaveBalance)
        private balanceRepository: Repository<LeaveBalance>,
        @InjectRepository(TimeOffRequest)
        private requestRepository: Repository<TimeOffRequest>,
        @InjectRepository(SyncLog)
        private syncLogRepository: Repository<SyncLog>,
        private hcmMockService: HcmMockService,
    ) { }

    async realtimeSync(requestingUser: any, userId: string, locationId: string) {
        if (
            requestingUser.role !== UserRole.ADMIN &&
            requestingUser.role !== UserRole.MANAGER
        ) {
            throw new ForbiddenException('Only admins and managers can trigger sync');
        }

        // Pull balance directly from HCM service (in-process)
        const hcmRecord = this.hcmMockService.getBalance(userId, locationId);
        const hcmBalance = hcmRecord.balance;

        // Get local balance
        let local = await this.balanceRepository.findOne({
            where: { userId, locationId },
        });

        const previousBalance = local ? Number(local.balance) : 0;

        if (!local) {
            local = this.balanceRepository.create({
                userId,
                locationId,
                balance: hcmBalance,
                version: 1,
            });
        }

        // No change — nothing to do
        if (Number(local.balance) === hcmBalance) {
            return { previousBalance, newBalance: hcmBalance, requestsFailed: 0 };
        }

        local.balance = hcmBalance;
        local.version = (local.version ?? 1) + 1;
        await this.balanceRepository.save(local);

        // Log the sync
        await this.syncLogRepository.save({
            type: SyncType.REALTIME,
            userId,
            previousBalance,
            newBalance: hcmBalance,
            triggeredBy: `realtime-sync by ${requestingUser.email}`,
        });

        const requestsFailed = await this.invalidatePendingRequests(userId, locationId, hcmBalance);

        return { previousBalance, newBalance: hcmBalance, requestsFailed };
    }

    async batchSync(
        requestingUser: any,
        balances: { userId: string; locationId: string; balance: number }[],
    ) {
        if (
            requestingUser.role !== UserRole.ADMIN &&
            requestingUser.role !== UserRole.MANAGER
        ) {
            throw new ForbiddenException('Only admins and managers can trigger sync');
        }

        let updated = 0;
        let unchanged = 0;
        let requestsFailed = 0;

        for (const entry of balances) {
            let local = await this.balanceRepository.findOne({
                where: { userId: entry.userId, locationId: entry.locationId },
            });

            const previousBalance = local ? Number(local.balance) : 0;

            if (!local) {
                local = this.balanceRepository.create({
                    userId: entry.userId,
                    locationId: entry.locationId,
                    balance: entry.balance,
                    version: 1,
                });
                await this.balanceRepository.save(local);
                updated++;
            } else if (Number(local.balance) === entry.balance) {
                unchanged++;
                continue;
            } else {
                local.balance = entry.balance;
                local.version = (local.version ?? 1) + 1;
                await this.balanceRepository.save(local);
                updated++;
            }

            await this.syncLogRepository.save({
                type: SyncType.BATCH,
                userId: entry.userId,
                previousBalance,
                newBalance: entry.balance,
                triggeredBy: `batch-sync by ${requestingUser.email}`,
            });

            const failed = await this.invalidatePendingRequests(
                entry.userId,
                entry.locationId,
                entry.balance,
            );
            requestsFailed += failed;
        }

        return { updated, unchanged, requestsFailed };
    }

    async getSyncLogs(requestingUser: any) {
        if (requestingUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can view sync logs');
        }

        return this.syncLogRepository.find({
            order: { createdAt: 'DESC' },
        });
    }

    private async invalidatePendingRequests(
        userId: string,
        locationId: string,
        newBalance: number,
    ): Promise<number> {
        const pendingRequests = await this.requestRepository.find({
            where: { userId, locationId, status: RequestStatus.PENDING },
        });

        const toFail = pendingRequests.filter((r) => r.daysRequested > newBalance);

        for (const req of toFail) {
            req.status = RequestStatus.FAILED;
            await this.requestRepository.save(req);
        }

        return toFail.length;
    }
}