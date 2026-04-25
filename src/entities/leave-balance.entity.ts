import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('leave_balances')
export class LeaveBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    locationId: string;

    @Column({ type: 'decimal', default: 0 })
    balance: number;

    @Column({ default: 1 })
    version: number;

    @UpdateDateColumn()
    lastSyncedAt: Date;
}