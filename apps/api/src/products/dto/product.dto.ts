import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(500)
  @Max(100_000_000)
  price!: number; // FCFA

  @IsIn(['Android', 'iOS', 'Both'])
  platform!: 'Android' | 'iOS' | 'Both';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  playersCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coins?: number;

  @IsOptional()
  @IsBoolean()
  hasLegends?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  specialFeatures?: string;
}

export class SetCredentialsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  login!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  password!: string;
}

export class ReviewProductDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class PresignMediaDto {
  @IsIn(['IMAGE', 'VIDEO'])
  mediaType!: 'IMAGE' | 'VIDEO';

  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(60 * 1024 * 1024)
  contentLength!: number;
}

export class ConfirmMediaDto {
  @IsString()
  objectKey!: string;

  @IsBoolean()
  isCover!: boolean;
}
