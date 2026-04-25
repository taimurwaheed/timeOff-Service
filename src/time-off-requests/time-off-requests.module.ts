import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequestsService } from './time-off-requests.service';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User } from '../entities/user.entity';
import { SyncLog } from '../entities/sync-log.entity';
import { HcmMockModule } from '../hcm-mock/hcm-mock.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([TimeOffRequest, LeaveBalance, User, SyncLog]),
        HcmMockModule,
    ],
    controllers: [TimeOffRequestsController],
    providers: [TimeOffRequestsService],
})
export class TimeOffRequestsModule { }