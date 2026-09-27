import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TwoFaService } from './twofa.service';
import { IsString, Length } from 'class-validator';

class EnableDto {
  @IsString()
  secret!: string;

  @IsString()
  @Length(6, 6)
  token!: string;
}

class VerifyDto {
  @IsString()
  @Length(6, 6)
  token!: string;
}

@Controller({ path: '2fa', version: '1' })
@UseGuards(RolesGuard)
export class TwoFaController {
  constructor(private readonly twofa: TwoFaService) {}

  /** Génère un secret + QR (utilisateur lui-même). */
  @Post('setup')
  @Roles('ADMIN', 'STAFF')
  setup(@Req() req: FastifyRequest) {
    return this.twofa.setup((req as any).user.sub);
  }

  /** Active après scan du QR. */
  @Post('enable')
  @Roles('ADMIN', 'STAFF')
  enable(@Req() req: FastifyRequest, @Body() dto: EnableDto) {
    return this.twofa.enable((req as any).user.sub, dto.secret, dto.token);
  }

  /** Vérifie le TOTP (étape 2 du login). */
  @Post('verify')
  @Roles('ADMIN', 'STAFF')
  verify(@Req() req: FastifyRequest, @Body() dto: VerifyDto) {
    return this.twofa.verify((req as any).user.sub, dto.token);
  }

  /** Désactive — self-service ou ADMIN pour un autre compte. */
  @Post('disable/:userId')
  @Roles('ADMIN')
  disable(
    @Req() req: FastifyRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.twofa.disable(
      (req as any).user.sub,
      userId,
      (req as any).user.sub === userId,
    );
  }
}
