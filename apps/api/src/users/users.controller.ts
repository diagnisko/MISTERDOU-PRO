import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('me')
  me(@Request() req: FastifyRequest) {
    return (req as any).user; // { sub, role }
  }
}
