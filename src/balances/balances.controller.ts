import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('balances')
@UseGuards(JwtAuthGuard)
export class BalancesController {
    constructor(private balancesService: BalancesService) { }

    @Get()
    async getAllBalances(@Request() req) {
        return this.balancesService.getAllBalances(req.user);
    }

    @Get(':userId')
    async getBalance(@Request() req, @Param('userId') userId: string) {
        return this.balancesService.getBalance(req.user, userId);
    }
}