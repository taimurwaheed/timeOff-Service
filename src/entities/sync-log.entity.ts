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

    @Column({ nullable: true })
    locationId: string;

    @Column({ type: 'float' })
    previousBalance: number;

    @Column({ type: 'float' })
    newBalance: number;

    @Column()
    triggeredBy: string;

    @CreateDateColumn()
    createdAt: Date;
}