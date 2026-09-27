import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { KycService } from './kyc.service';
import {
  PresignKycDocDto,
  ReviewKycDto,
  SubmitKycDto,
} from './dto/kyc.dto';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'kyc', version: '1' })
@UseGuards(RolesGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  // ---------- CLIENT ----------

  @Post('documents/presign')
  presign(@Req() req: FastifyRequest, @Body() dto: PresignKycDocDto) {
    return this.kyc.presignUpload(
      (req as any).user.sub,
      dto.docKind,
      dto.contentType,
    );
  }

  @Post('documents/confirm')
  confirm(
    @Req() req: FastifyRequest,
    @Body()
    body: { docKind: string; objectKey: string },
  ) {
    return this.kyc.confirmUpload(
      (req as any).user.sub,
      body.docKind,
      body.objectKey,
    );
    // DTO léger : validation renforcée dans le service (kycKeySecurity)
  }

  @Post('submit')
  submit(@Req() req: FastifyRequest, @Body() dto: SubmitKycDto) {
    return this.kyc.submit((req as any).user.sub, dto);
  }

  @Get('me')
  me(@Req() req: FastifyRequest) {
    return this.kyc.myStatus((req as any).user.sub);
  }

  // ---------- ADMIN / STAFF ----------

  @Get('admin/pending')
  @Roles('ADMIN', 'STAFF')
  listPending(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.kyc.listPending(
      Math.max(1, Number(page ?? 1)),
      Math.min(50, Number(perPage ?? 20)),
    );
  }

  @Get('admin/:id/document/:docKind')
  @Roles('ADMIN', 'STAFF')
  viewDocument(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docKind') docKind: 'doc-front' | 'doc-back' | 'selfie',
  ) {
    return this.kyc.viewDocument((req as any).user.sub, id, docKind);
  }

  @Post('admin/:id/review')
  @Roles('ADMIN', 'STAFF')
  review(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kyc.review(
      (req as any).user.sub,
      id,
      dto.decision,
      dto.comment,
    );
  }
}
