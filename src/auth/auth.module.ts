import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { SeedService } from './seed.service';
import { User } from '../entities/user.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { HcmMockModule } from '../hcm-mock/hcm-mock.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, LeaveBalance]),
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET ?? 'timeoff_secret_key',
            signOptions: { expiresIn: '24h' },
        }),
        HcmMockModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, SeedService],
    exports: [AuthService],
})
export class AuthModule { }