import { Module } from '@nestjs/common';
import { HcmMockController } from './hcm-mock.controller';
import { HcmMockService } from './hcm-mock.service';

@Module({
    imports: [],
    controllers: [HcmMockController],
    providers: [HcmMockService],
    exports: [HcmMockService],
})
export class HcmMockModule { }