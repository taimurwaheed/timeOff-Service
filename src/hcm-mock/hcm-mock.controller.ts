import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { HcmMockService } from './hcm-mock.service';

@Controller('hcm')
export class HcmMockController {
    constructor(private hcmMockService: HcmMockService) { }

    @Post('seed')
    seed(@Body() body: { employeeId: string; locationId: string; balance: number }) {
        return this.hcmMockService.seed(body.employeeId, body.locationId, body.balance);
    }

    @Post('reset')
    reset() {
        this.hcmMockService.reset();
        return { message: 'HCM state reset successfully' };
    }

    @Get('balances/:employeeId/:locationId')
    getBalance(
        @Param('employeeId') employeeId: string,
        @Param('locationId') locationId: string,
    ) {
        return this.hcmMockService.getBalance(employeeId, locationId);
    }

    @Post('balances/batch')
    batchUpsert(
        @Body() body: { balances: { employeeId: string; locationId: string; balance: number }[] },
    ) {
        return this.hcmMockService.batchUpsert(body.balances);
    }

    @Post('balances/:employeeId/:locationId/adjust')
    adjust(
        @Param('employeeId') employeeId: string,
        @Param('locationId') locationId: string,
        @Body() body: { delta: number; reason: string },
    ) {
        return this.hcmMockService.adjust(employeeId, locationId, body.delta, body.reason);
    }
}