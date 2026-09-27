import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'users', version: '1' })
@UseGuards(RolesGuard)
export class UsersController {
  @Get('me')
  me(@Request() req: FastifyRequest) {
    return (req as any).user; // { sub, role }
  }
}
