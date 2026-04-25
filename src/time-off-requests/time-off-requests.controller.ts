import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { TimeOffRequestsService } from './time-off-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';

@Controller('time-off-requests')
@UseGuards(JwtAuthGuard)
export class TimeOffRequestsController {
    constructor(private timeOffRequestsService: TimeOffRequestsService) { }

    @Post()
    async createRequest(
        @Request() req,
        @Body() body: CreateTimeOffRequestDto,
    ) {
        return this.timeOffRequestsService.createRequest(req.user, body);
    }

    @Get()
    async getRequests(@Request() req) {
        return this.timeOffRequestsService.getRequests(req.user);
    }

    @Patch(':id/approve')
    async approveRequest(@Request() req, @Param('id') id: string) {
        return this.timeOffRequestsService.approveRequest(req.user, id);
    }

    @Patch(':id/reject')
    async rejectRequest(@Request() req, @Param('id') id: string) {
        return this.timeOffRequestsService.rejectRequest(req.user, id);
    }

    @Patch(':id/cancel')
    async cancelRequest(@Request() req, @Param('id') id: string) {
        return this.timeOffRequestsService.cancelRequest(req.user, id);
    }
}