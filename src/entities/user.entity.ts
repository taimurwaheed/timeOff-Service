import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum UserRole {
    EMPLOYEE = 'EMPLOYEE',
    MANAGER = 'MANAGER',
    ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column({ type: 'text', default: UserRole.EMPLOYEE })
    role: UserRole;

    @Column({ nullable: true })
    managerId: string;

    @Column()
    locationId: string;

    @CreateDateColumn()
    createdAt: Date;
}