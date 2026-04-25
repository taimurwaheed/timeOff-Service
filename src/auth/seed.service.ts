import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(LeaveBalance)
        private leaveBalanceRepository: Repository<LeaveBalance>,
    ) { }

    async onApplicationBootstrap() {
        await this.seedUsers();
    }

    async seedUsers() {
        const existingUser = await this.userRepository.findOne({
            where: { email: 'employee@test.com' },
        });

        if (existingUser) return;

        const hashedPassword = await bcrypt.hash('password123', 10);

        const admin = this.userRepository.create({
            name: 'Admin User',
            email: 'admin@test.com',
            password: hashedPassword,
            role: UserRole.ADMIN,
            locationId: 'LOC001',
        });
        await this.userRepository.save(admin);

        const manager = this.userRepository.create({
            name: 'Manager User',
            email: 'manager@test.com',
            password: hashedPassword,
            role: UserRole.MANAGER,
            locationId: 'LOC001',
        });
        await this.userRepository.save(manager);

        const employee = this.userRepository.create({
            name: 'Employee User',
            email: 'employee@test.com',
            password: hashedPassword,
            role: UserRole.EMPLOYEE,
            managerId: manager.id,
            locationId: 'LOC001',
        });
        await this.userRepository.save(employee);

        await this.leaveBalanceRepository.save([
            { userId: admin.id, locationId: 'LOC001', balance: 20, version: 1 },
            { userId: manager.id, locationId: 'LOC001', balance: 15, version: 1 },
            { userId: employee.id, locationId: 'LOC001', balance: 10, version: 1 },
        ]);

        console.log('Database seeded successfully');
    }
}