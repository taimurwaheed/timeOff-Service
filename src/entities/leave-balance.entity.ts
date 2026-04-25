import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('leave_balances')
@Unique(['userId', 'locationId'])
export class LeaveBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    locationId: string;

    @Column({ type: 'float', default: 0 })
    balance: number;

    @Column({ default: 1 })
    version: number;

    @UpdateDateColumn()
    lastSyncedAt: Date;
}