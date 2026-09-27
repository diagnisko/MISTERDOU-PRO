import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  subject!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string; // premier message du ticket
}

export class ReplyTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class UpdateTicketStatusDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}
