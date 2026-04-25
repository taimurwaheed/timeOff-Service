import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User, UserRole } from '../entities/user.entity';

@Injectable()
export class BalancesService {
    constructor(
        @InjectRepository(LeaveBalance)
        private balanceRepository: Repository<LeaveBalance>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async getBalance(requestingUser: any, targetUserId: string) {
        const targetUser = await this.userRepository.findOne({
            where: { id: targetUserId },
        });

        if (!targetUser) {
            throw new NotFoundException('User not found');
        }

        // EMPLOYEE can only see their own balance
        if (requestingUser.role === UserRole.EMPLOYEE) {
            if (requestingUser.userId !== targetUserId) {
                throw new ForbiddenException('You can only view your own balance');
            }
        }

        // MANAGER can only see their team's balances
        if (requestingUser.role === UserRole.MANAGER) {
            if (
                requestingUser.userId !== targetUserId &&
                targetUser.managerId !== requestingUser.userId
            ) {
                throw new ForbiddenException('You can only view your team balances');
            }
        }

        const balances = await this.balanceRepository.find({
            where: { userId: targetUserId },
        });

        return {
            userId: targetUserId,
            name: targetUser.name,
            balances,
        };
    }

    async getAllBalances(requestingUser: any) {
        // ADMIN only
        if (requestingUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can view all balances');
        }

        const balances = await this.balanceRepository.find();
        return balances;
    }
}