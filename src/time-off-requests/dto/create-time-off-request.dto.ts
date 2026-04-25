import { IsString, IsInt, IsPositive, IsDateString, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'isEndDateAfterStartDate' })
class IsEndDateAfterStartDate implements ValidatorConstraintInterface {
    validate(endDate: string, args: ValidationArguments) {
        const dto = args.object as CreateTimeOffRequestDto;
        return new Date(endDate) >= new Date(dto.startDate);
    }
    defaultMessage() {
        return 'endDate must be after or equal to startDate';
    }
}

export class CreateTimeOffRequestDto {
    @IsDateString()
    startDate: string;

    @IsDateString()
    @Validate(IsEndDateAfterStartDate)
    endDate: string;

    @IsInt()
    @IsPositive()
    daysRequested: number;
}