import {
    Injectable,
    ForbiddenException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { User, UserRole } from '../entities/user.entity';
import { SyncLog, SyncType } from '../entities/sync-log.entity';

@Injectable()
export class TimeOffRequestsService {
    constructor(
        @InjectRepository(TimeOffRequest)
        private requestRepository: Repository<TimeOffRequest>,
        @InjectRepository(LeaveBalance)
        private balanceRepository: Repository<LeaveBalance>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(SyncLog)
        private syncLogRepository: Repository<SyncLog>,
    ) { }

    async createRequest(requestingUser: any, dto: {
        startDate: string;
        endDate: string;
        daysRequested: number;
    }) {
        // Check balance before creating request
        const balance = await this.balanceRepository.findOne({
            where: {
                userId: requestingUser.userId,
                locationId: requestingUser.locationId,
            },
        });

        if (!balance) {
            throw new BadRequestException('No leave balance found');
        }

        if (balance.balance < dto.daysRequested) {
            throw new BadRequestException(
                `Insufficient balance. You have ${balance.balance} days remaining`,
            );
        }

        const request = this.requestRepository.create({
            userId: requestingUser.userId,
            locationId: requestingUser.locationId,
            startDate: dto.startDate,
            endDate: dto.endDate,
            daysRequested: dto.daysRequested,
            status: RequestStatus.PENDING,
        });

        return this.requestRepository.save(request);
    }

    async getRequests(requestingUser: any) {
        if (requestingUser.role === UserRole.ADMIN) {
            return this.requestRepository.find();
        }

        if (requestingUser.role === UserRole.MANAGER) {
            const teamMembers = await this.userRepository.find({
                where: { managerId: requestingUser.userId },
            });
            const teamIds = [
                requestingUser.userId,
                ...teamMembers.map((m) => m.id),
            ];
            return this.requestRepository
                .createQueryBuilder('request')
                .where('request.userId IN (:...ids)', { ids: teamIds })
                .getMany();
        }

        return this.requestRepository.find({
            where: { userId: requestingUser.userId },
        });
    }

    async approveRequest(requestingUser: any, requestId: string) {
        if (
            requestingUser.role !== UserRole.MANAGER &&
            requestingUser.role !== UserRole.ADMIN
        ) {
            throw new ForbiddenException('Only managers and admins can approve requests');
        }

        const request = await this.requestRepository.findOne({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException('Request not found');
        }

        if (request.status !== RequestStatus.PENDING) {
            throw new BadRequestException('Only pending requests can be approved');
        }

        // Manager can only approve their team's requests
        if (requestingUser.role === UserRole.MANAGER) {
            const employee = await this.userRepository.findOne({
                where: { id: request.userId },
            });
            if (employee.managerId !== requestingUser.userId) {
                throw new ForbiddenException('You can only approve your team requests');
            }
        }

        // Deduct balance with optimistic locking
        const balance = await this.balanceRepository.findOne({
            where: {
                userId: request.userId,
                locationId: request.locationId,
            },
        });

        if (!balance || balance.balance < request.daysRequested) {
            request.status = RequestStatus.FAILED;
            await this.requestRepository.save(request);
            throw new BadRequestException('Insufficient balance');
        }

        const previousBalance = Number(balance.balance);
        const newBalance = previousBalance - request.daysRequested;

        // Update balance with version check (optimistic locking)
        const updateResult = await this.balanceRepository
            .createQueryBuilder()
            .update(LeaveBalance)
            .set({
                balance: newBalance,
                version: balance.version + 1,
            })
            .where('id = :id AND version = :version', {
                id: balance.id,
                version: balance.version,
            })
            .execute();

        if (updateResult.affected === 0) {
            throw new BadRequestException(
                'Balance was modified concurrently, please try again',
            );
        }

        // Log the balance change
        await this.syncLogRepository.save({
            type: SyncType.REALTIME,
            userId: request.userId,
            previousBalance,
            newBalance,
            triggeredBy: `Manager approval by ${requestingUser.email}`,
        });

        request.status = RequestStatus.COMMITTED;
        return this.requestRepository.save(request);
    }

    async rejectRequest(requestingUser: any, requestId: string) {
        if (
            requestingUser.role !== UserRole.MANAGER &&
            requestingUser.role !== UserRole.ADMIN
        ) {
            throw new ForbiddenException('Only managers and admins can reject requests');
        }

        const request = await this.requestRepository.findOne({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException('Request not found');
        }

        if (request.status !== RequestStatus.PENDING) {
            throw new BadRequestException('Only pending requests can be rejected');
        }

        if (requestingUser.role === UserRole.MANAGER) {
            const employee = await this.userRepository.findOne({
                where: { id: request.userId },
            });
            if (employee.managerId !== requestingUser.userId) {
                throw new ForbiddenException('You can only reject your team requests');
            }
        }

        request.status = RequestStatus.REJECTED;
        return this.requestRepository.save(request);
    }

    async cancelRequest(requestingUser: any, requestId: string) {
        const request = await this.requestRepository.findOne({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException('Request not found');
        }

        if (request.userId !== requestingUser.userId) {
            throw new ForbiddenException('You can only cancel your own requests');
        }

        if (request.status !== RequestStatus.PENDING) {
            throw new BadRequestException('Only pending requests can be cancelled');
        }

        request.status = RequestStatus.REJECTED;
        return this.requestRepository.save(request);
    }
}