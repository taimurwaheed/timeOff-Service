import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
    constructor(private syncService: SyncService) { }

    @Post('realtime/:userId/:locationId')
    async realtimeSync(
        @Request() req,
        @Param('userId') userId: string,
        @Param('locationId') locationId: string,
    ) {
        return this.syncService.realtimeSync(req.user, userId, locationId);
    }

    @Post('batch')
    async batchSync(
        @Request() req,
        @Body() body: { balances: { userId: string; locationId: string; balance: number }[] },
    ) {
        return this.syncService.batchSync(req.user, body.balances);
    }

    @Get('logs')
    async getSyncLogs(@Request() req) {
        return this.syncService.getSyncLogs(req.user);
    }
}