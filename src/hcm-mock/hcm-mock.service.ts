import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

export interface HcmBalance {
    employeeId: string;
    locationId: string;
    balance: number;
}

@Injectable()
export class HcmMockService {
    private store = new Map<string, HcmBalance>();

    private key(employeeId: string, locationId: string): string {
        return `${employeeId}:${locationId}`;
    }

    seed(employeeId: string, locationId: string, balance: number): HcmBalance {
        const record: HcmBalance = { employeeId, locationId, balance };
        this.store.set(this.key(employeeId, locationId), record);
        return record;
    }

    reset(): void {
        this.store.clear();
    }

    getBalance(employeeId: string, locationId: string): HcmBalance {
        const record = this.store.get(this.key(employeeId, locationId));
        if (!record) {
            throw new NotFoundException(
                `No HCM balance found for employee ${employeeId} at location ${locationId}`,
            );
        }
        return record;
    }

    batchUpsert(balances: { employeeId: string; locationId: string; balance: number }[]): HcmBalance[] {
        for (const entry of balances) {
            this.store.set(this.key(entry.employeeId, entry.locationId), {
                employeeId: entry.employeeId,
                locationId: entry.locationId,
                balance: entry.balance,
            });
        }
        return Array.from(this.store.values());
    }

    adjust(employeeId: string, locationId: string, delta: number, reason: string): HcmBalance {
        const record = this.store.get(this.key(employeeId, locationId));
        if (!record) {
            throw new NotFoundException(
                `No HCM balance found for employee ${employeeId} at location ${locationId}`,
            );
        }

        const newBalance = record.balance + delta;
        if (newBalance < 0) {
            throw new BadRequestException(
                `Adjustment of ${delta} would result in negative balance (${newBalance}) for employee ${employeeId}. Reason: ${reason}`,
            );
        }

        record.balance = newBalance;
        return record;
    }

    getAllBalances(): HcmBalance[] {
        return Array.from(this.store.values());
    }
}