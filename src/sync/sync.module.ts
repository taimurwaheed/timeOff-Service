import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { SyncLog } from '../entities/sync-log.entity';
import { User } from '../entities/user.entity';
import { HcmMockModule } from '../hcm-mock/hcm-mock.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([LeaveBalance, TimeOffRequest, SyncLog, User]),
        HcmMockModule,
    ],
    controllers: [SyncController],
    providers: [SyncService],
    exports: [SyncService],
})
export class SyncModule { }