import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { SeedService } from './seed.service';
import { User } from '../entities/user.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, LeaveBalance]),
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET ?? 'timeoff_secret_key',
            signOptions: { expiresIn: '24h' },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, SeedService],
    exports: [AuthService, JwtModule],
})
export class AuthModule { }