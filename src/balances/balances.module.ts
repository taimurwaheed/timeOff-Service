import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalancesService } from './balances.service';
import { BalancesController } from './balances.controller';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User } from '../entities/user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([LeaveBalance, User])],
    controllers: [BalancesController],
    providers: [BalancesService],
    exports: [BalancesService],
})
export class BalancesModule { }