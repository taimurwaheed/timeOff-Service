import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    COMMITTED = 'COMMITTED',
    FAILED = 'FAILED',
}

@Entity('time_off_requests')
export class TimeOffRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column()
    locationId: string;

    @Column()
    startDate: string;

    @Column()
    endDate: string;

    @Column()
    daysRequested: number;

    @Column({ type: 'text', default: RequestStatus.PENDING })
    status: RequestStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}