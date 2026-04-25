import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { SyncLog, SyncType } from '../entities/sync-log.entity';
import { HcmMockService } from '../hcm-mock/hcm-mock.service';

@Injectable()
export class SyncScheduler {
    private readonly logger = new Logger(SyncScheduler.name);

    constructor(
        @InjectRepository(LeaveBalance)
        private balanceRepository: Repository<LeaveBalance>,
        @InjectRepository(TimeOffRequest)
        private requestRepository: Repository<TimeOffRequest>,
        @InjectRepository(SyncLog)
        private syncLogRepository: Repository<SyncLog>,
        private hcmMockService: HcmMockService,
    ) { }

    // Runs every 30 minutes
    @Cron(CronExpression.EVERY_30_MINUTES)
    async scheduledBalanceSync() {
        this.logger.log('Starting scheduled HCM balance sync...');

        const hcmBalances = this.hcmMockService.getAllBalances();

        if (hcmBalances.length === 0) {
            this.logger.log('No HCM balances found — skipping scheduled sync');
            return;
        }

        let updated = 0;
        let unchanged = 0;
        let requestsFailed = 0;

        for (const hcmRecord of hcmBalances) {
            try {
                const local = await this.balanceRepository.findOne({
                    where: {
                        userId: hcmRecord.employeeId,
                        locationId: hcmRecord.locationId,
                    },
                });

                if (!local) {
                    // New balance record — create it
                    await this.balanceRepository.save({
                        userId: hcmRecord.employeeId,
                        locationId: hcmRecord.locationId,
                        balance: hcmRecord.balance,
                        version: 1,
                    });

                    await this.syncLogRepository.save({
                        type: SyncType.BATCH,
                        userId: hcmRecord.employeeId,
                        locationId: hcmRecord.locationId,
                        previousBalance: 0,
                        newBalance: hcmRecord.balance,
                        triggeredBy: 'scheduled-sync',
                    });

                    updated++;
                    continue;
                }

                const previousBalance = Number(local.balance);

                if (previousBalance === hcmRecord.balance) {
                    unchanged++;
                    continue;
                }

                // Optimistic locking update
                const updateResult = await this.balanceRepository
                    .createQueryBuilder()
                    .update(LeaveBalance)
                    .set({
                        balance: hcmRecord.balance,
                        version: local.version + 1,
                    })
                    .where('id = :id AND version = :version', {
                        id: local.id,
                        version: local.version,
                    })
                    .execute();

                if (updateResult.affected === 0) {
                    this.logger.warn(
                        `Skipping ${hcmRecord.employeeId}/${hcmRecord.locationId} — concurrent modification detected`,
                    );
                    unchanged++;
                    continue;
                }

                await this.syncLogRepository.save({
                    type: SyncType.BATCH,
                    userId: hcmRecord.employeeId,
                    locationId: hcmRecord.locationId,
                    previousBalance,
                    newBalance: hcmRecord.balance,
                    triggeredBy: 'scheduled-sync',
                });

                // Invalidate pending requests that exceed new balance
                const pendingRequests = await this.requestRepository.find({
                    where: {
                        userId: hcmRecord.employeeId,
                        locationId: hcmRecord.locationId,
                        status: RequestStatus.PENDING,
                    },
                });

                const toFail = pendingRequests.filter(
                    (r) => r.daysRequested > hcmRecord.balance,
                );

                for (const req of toFail) {
                    req.status = RequestStatus.FAILED;
                    await this.requestRepository.save(req);
                    requestsFailed++;
                }

                updated++;
            } catch (err) {
                this.logger.error(
                    `Failed to sync balance for ${hcmRecord.employeeId}/${hcmRecord.locationId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
                );
            }
        }

        this.logger.log(
            `Scheduled sync complete — updated: ${updated}, unchanged: ${unchanged}, requestsFailed: ${requestsFailed}`,
        );
    }
}