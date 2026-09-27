import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller({ path: 'admin', version: '1' })
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Vue d'ensemble : files de revue + volumes financiers. */
  @Get('dashboard')
  @Roles('ADMIN', 'STAFF')
  dashboard() {
    return this.admin.dashboard();
  }

  /** CA par canal (Wave / Orange Money). */
  @Get('stats/revenue-by-channel')
  @Roles('ADMIN', 'STAFF')
  revenueByChannel() {
    return this.admin.revenueByChannel();
  }

  /** CA mensuel — 6 derniers mois. */
  @Get('stats/revenue-monthly')
  @Roles('ADMIN', 'STAFF')
  revenueMonthly() {
    return this.admin.revenueMonthly();
  }

  /** Journaux d'audit — consultation ADMIN uniquement. */
  @Get('audit-logs')
  @Roles('ADMIN')
  auditLogs(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
  ) {
    return this.admin.auditLogs({
      page: Number(page ?? 1) || 1,
      perPage: Number(perPage ?? 50) || 50,
      action,
      entity,
    });
  }

  /** Recherche utilisateurs (KYC, boutique, statut). */
  @Get('users')
  @Roles('ADMIN', 'STAFF')
  listUsers(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('q') q?: string,
    @Query('role') role?: string,
  ) {
    return this.admin.listUsers({
      page: Number(page ?? 1) || 1,
      perPage: Number(perPage ?? 20) || 20,
      q,
      role,
    });
  }
}
