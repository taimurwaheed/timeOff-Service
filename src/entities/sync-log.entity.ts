import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum SyncType {
    REALTIME = 'REALTIME',
    BATCH = 'BATCH',
}

@Entity('sync_logs')
export class SyncLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'text' })
    type: SyncType;

    @Column()
    userId: string;

    @Column({ type: 'decimal' })
    previousBalance: number;

    @Column({ type: 'decimal' })
    newBalance: number;

    @Column()
    triggeredBy: string;

    @CreateDateColumn()
    createdAt: Date;
}