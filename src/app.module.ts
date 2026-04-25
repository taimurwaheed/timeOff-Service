import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { User } from './entities/user.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { SyncLog } from './entities/sync-log.entity';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BalancesModule } from './balances/balances.module';
import { TimeOffRequestsModule } from './time-off-requests/time-off-requests.module';
import { SyncModule } from './sync/sync.module';
import { HcmMockModule } from './hcm-mock/hcm-mock.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'timeoff.db',
      entities: [User, LeaveBalance, TimeOffRequest, SyncLog],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    BalancesModule,
    TimeOffRequestsModule,
    SyncModule,
    HcmMockModule,
  ],
})
export class AppModule { }