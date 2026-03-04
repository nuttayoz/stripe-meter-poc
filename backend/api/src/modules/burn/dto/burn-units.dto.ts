import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BurnUnitsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  priceId!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  units!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
