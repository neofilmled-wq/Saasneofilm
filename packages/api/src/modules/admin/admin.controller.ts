import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGateway } from './admin.gateway';
import { Roles, Permissions, CurrentUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes';
import { adminCreateUserSchema, adminUpdateUserSchema } from '@neofilm/shared';
import { Response } from 'express';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminGateway: AdminGateway,
  ) {}

  // ── Users ──────────────────────────────

  @Get('users')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Search/list admin users' })
  async searchUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('platformRole') platformRole?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.adminService.searchUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      q,
      platformRole,
      isActive,
    });
  }

  @Post('users')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Create a platform user' })
  async createUser(@Body(new ZodValidationPipe(adminCreateUserSchema)) data: any) {
    const result = await this.adminService.createUser(data);
    this.adminGateway.emitUsersChanged();
    return result;
  }

  @Patch('users/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Update a platform user' })
  async updateUser(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.updateUser(id, data);
    this.adminGateway.emitUsersChanged();
    return result;
  }

  @Post('users/:id/reset-password')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Reset user password' })
  async resetPassword(@Param('id') id: string) {
    return this.adminService.resetPassword(id);
  }

  @Post('users/:id/suspend')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Suspend a user' })
  async suspendUser(@Param('id') id: string) {
    const result = await this.adminService.toggleUserStatus(id, false);
    this.adminGateway.emitUsersChanged();
    return result;
  }

  @Post('users/:id/activate')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Activate a user' })
  async activateUser(@Param('id') id: string) {
    const result = await this.adminService.toggleUserStatus(id, true);
    this.adminGateway.emitUsersChanged();
    return result;
  }

  @Delete('users/:id')
  @Roles('SUPER_ADMIN')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Soft-delete a user' })
  async deleteUser(@Param('id') id: string) {
    const result = await this.adminService.softDeleteUser(id);
    this.adminGateway.emitUsersChanged();
    return result;
  }

  // ── Settings ───────────────────────────

  @Get('settings')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get platform settings' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update platform settings' })
  async updateSettings(@Body() data: Record<string, string>) {
    return this.adminService.updateSettings(data);
  }

  // ── Blackouts ──────────────────────────

  @Get('blackouts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List schedule blackouts' })
  async getBlackouts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getBlackouts({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post('blackouts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a schedule blackout' })
  async createBlackout(@Body() data: any, @CurrentUser() user: any) {
    return this.adminService.createBlackout({ ...data, createdById: user.id });
  }

  @Delete('blackouts/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a blackout' })
  async deleteBlackout(@Param('id') id: string) {
    return this.adminService.deleteBlackout(id);
  }

  // ── Campaign Workflow ──────────────────

  @Post('campaigns/:id/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('campaigns:approve')
  @ApiOperation({ summary: 'Approve a campaign' })
  async approveCampaign(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: any,
  ) {
    const result = await this.adminService.approveCampaign(id, user.id, body.notes);
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('campaigns/:id/reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('campaigns:approve')
  @ApiOperation({ summary: 'Reject a campaign' })
  async rejectCampaign(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) {
    const result = await this.adminService.rejectCampaign(id, user.id, body.reason);
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  // ── Screens (admin) ───────────────────

  @Get('screens')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List screens with admin filters' })
  async getScreens(
    @Query('status') status?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
    @Query('city') city?: string,
    @Query('online') online?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getScreens({
      status, partnerOrgId, city, online,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Patch('screens/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update screen (name, status, location, maintenanceMode)' })
  async updateScreen(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.updateScreen(id, data);
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('screens/bulk-approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Bulk approve pending screens' })
  async bulkApproveScreens(@Body() body: { ids: string[] }, @CurrentUser() user: any) {
    const result = await this.adminService.bulkApproveScreens(body.ids, user.id);
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('screens/bulk-reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Bulk reject pending screens' })
  async bulkRejectScreens(@Body() body: { ids: string[]; reason: string }) {
    const result = await this.adminService.bulkRejectScreens(body.ids, body.reason);
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('screens/:id/force-reload')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Force-reload TV app on a screen' })
  async forceReloadScreen(@Param('id') id: string) {
    return this.adminService.forceReloadScreen(id);
  }

  // ── Moderation (Creatives/Videos) ────

  @Get('moderation/videos')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List creatives for moderation' })
  async getModerationQueue(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getModerationQueue({
      status, search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Patch('moderation/videos/:id/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve a creative' })
  async approveCreative(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.adminService.moderateCreative(id, 'approve', user.id);
    this.adminGateway.emitModerationChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Patch('moderation/videos/:id/reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reject a creative' })
  async rejectCreative(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user: any) {
    const result = await this.adminService.moderateCreative(id, 'reject', user.id, body.reason);
    this.adminGateway.emitModerationChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Patch('moderation/videos/:id/flag')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Flag a creative' })
  async flagCreative(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: any) {
    const result = await this.adminService.moderateCreative(id, 'flag', user.id, body.reason);
    this.adminGateway.emitModerationChanged();
    return result;
  }

  @Patch('moderation/videos/:id/unflag')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Unflag a creative (back to pending)' })
  async unflagCreative(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.adminService.moderateCreative(id, 'unflag', user.id);
    this.adminGateway.emitModerationChanged();
    return result;
  }

  @Post('moderation/videos/bulk')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Bulk approve or reject creatives' })
  async bulkModerateCreatives(@Body() body: { ids: string[]; action: 'approve' | 'reject'; reason?: string }, @CurrentUser() user: any) {
    const result = await this.adminService.bulkModerateCreatives(body.ids, body.action, user.id, body.reason);
    this.adminGateway.emitModerationChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  // ── Membership ───────────────────────

  @Post('orgs/:orgId/members')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Add a user to an organization' })
  async addMember(@Param('orgId') orgId: string, @Body() body: { userId: string; role?: string }) {
    const result = await this.adminService.addMember(orgId, body);
    this.adminGateway.emitPartnersChanged();
    this.adminGateway.emitAdvertisersChanged();
    return result;
  }

  // ── Enhanced Dashboard ───────────────

  @Get('dashboard/summary')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get enhanced admin dashboard summary' })
  async getAdminDashboardSummary() {
    return this.adminService.getAdminDashboardSummary();
  }

  @Get('dashboard/activity')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get recent activity feed' })
  async getRecentActivity(@Query('limit') limit?: string) {
    return this.adminService.getRecentActivity(limit ? parseInt(limit, 10) : 20);
  }

  @Get('dashboard/finance')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get financial KPIs for a given range' })
  async getFinanceKPIs(@Query('range') range?: string) {
    return this.adminService.getFinanceKPIs(range || 'month');
  }

  @Get('dashboard/network')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get network/diffusion KPIs for a given range' })
  async getNetworkKPIs(@Query('range') range?: string) {
    return this.adminService.getNetworkKPIs(range || 'month');
  }

  // ── Admin Partners ───────────────────

  @Get('partners')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List partners with live metrics' })
  async getAdminPartners(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAdminPartners({
      q, status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('partners/:id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get partner detail with full metrics' })
  async getAdminPartnerDetail(@Param('id') id: string) {
    return this.adminService.getAdminPartnerDetail(id);
  }

  @Patch('partners/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update partner (commission rate, status, compliance info)' })
  async updateAdminPartner(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.updateAdminPartner(id, data);
    this.adminGateway.emitPartnersChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('partners/:id/reset-password')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Send password reset to partner owner' })
  async resetPartnerPassword(@Param('id') id: string) {
    return this.adminService.resetPartnerOwnerPassword(id);
  }

  @Get('partners/:id/screens')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List partner screens with live status and capacity' })
  async getPartnerScreens(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('online') online?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPartnerScreensAdmin(id, {
      status, online,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Get('partners/:id/tv-config')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get TV config for all partner screens' })
  async getPartnerTvConfig(@Param('id') id: string) {
    return this.adminService.getPartnerTvConfig(id);
  }

  @Patch('partners/:id/screens/:screenId/tv-config')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update TV config for a specific screen' })
  async updateScreenTvConfig(
    @Param('id') _partnerId: string,
    @Param('screenId') screenId: string,
    @Body() data: any,
  ) {
    const result = await this.adminService.updateScreenTvConfig(screenId, data);
    this.adminGateway.emitScreensChanged();
    return result;
  }

  // ── Campaign Management (for advertiser) ──

  @Post('campaigns')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a campaign for an advertiser' })
  async createCampaignForAdvertiser(@Body() data: any) {
    const result = await this.adminService.createCampaignForAdvertiser(data);
    this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Patch('campaigns/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a campaign from admin' })
  async updateCampaignFromAdmin(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.updateCampaignFromAdmin(id, data);
    this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Delete('campaigns/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a campaign from admin' })
  async deleteCampaignFromAdmin(@Param('id') id: string) {
    const result = await this.adminService.deleteCampaignFromAdmin(id);
    this.adminGateway.emitAdvertisersChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  // ── Screen Management (for partner) ─────

  @Post('screens')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a screen for a partner' })
  async createScreenForPartner(@Body() data: any) {
    const result = await this.adminService.createScreenForPartner(data);
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Delete('screens/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a screen from admin' })
  async deleteScreenFromAdmin(@Param('id') id: string) {
    const result = await this.adminService.deleteScreenFromAdmin(id);
    this.adminGateway.emitScreensChanged();
    this.adminGateway.emitDashboardUpdate();
    return result;
  }

  @Post('screens/:id/pairing')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Generate pairing PIN for a screen' })
  async generatePairingForScreen(@Param('id') id: string) {
    return this.adminService.generatePairingForScreen(id);
  }

  // ── Venue / Site Management ─────────────

  @Get('partners/:id/venues')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List partner venues/sites' })
  async getPartnerVenues(@Param('id') id: string) {
    return this.adminService.getPartnerVenues(id);
  }

  @Post('partners/:id/venues')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a venue/site for a partner' })
  async createVenueForPartner(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.createVenueForPartner({ ...data, partnerOrgId: id });
    this.adminGateway.emitPartnersChanged();
    return result;
  }

  @Patch('venues/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a venue/site' })
  async updateVenue(@Param('id') id: string, @Body() data: any) {
    const result = await this.adminService.updateVenue(id, data);
    this.adminGateway.emitPartnersChanged();
    return result;
  }

  @Delete('venues/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a venue/site' })
  async deleteVenue(@Param('id') id: string) {
    const result = await this.adminService.deleteVenue(id);
    this.adminGateway.emitPartnersChanged();
    return result;
  }

  // ── Member Management ───────────────────

  @Delete('orgs/:orgId/members/:membershipId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Remove a member from an organization' })
  async removeMember(@Param('orgId') orgId: string, @Param('membershipId') membershipId: string) {
    const result = await this.adminService.removeMember(orgId, membershipId);
    this.adminGateway.emitPartnersChanged();
    this.adminGateway.emitAdvertisersChanged();
    return result;
  }

  @Patch('orgs/:orgId/members/:membershipId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update member role' })
  async updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: { role: string },
  ) {
    const result = await this.adminService.updateMemberRole(orgId, membershipId, body.role);
    this.adminGateway.emitPartnersChanged();
    this.adminGateway.emitAdvertisersChanged();
    return result;
  }

  // ── Analytics ──────────────────────────

  @Get('analytics')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Permissions('analytics:read')
  @ApiOperation({ summary: 'Get admin analytics' })
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('partnerOrgId') partnerOrgId?: string,
    @Query('advertiserOrgId') advertiserOrgId?: string,
  ) {
    return this.adminService.getAnalytics({ startDate, endDate, partnerOrgId, advertiserOrgId });
  }

  // ── Invoice Export ─────────────────────

  @Get('invoices/export')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('invoices:read')
  @ApiOperation({ summary: 'Export invoices as CSV' })
  async exportInvoices(@Query('status') status?: string, @Res() res?: Response) {
    const invoices = await this.adminService.getInvoicesForExport({ status });
    const header = 'id,stripeInvoiceId,organization,type,amountCents,amountPaidCents,status,currency,dueDate,paidAt,createdAt\n';
    const rows = invoices.map((inv: any) =>
      [inv.id, inv.stripeInvoiceId || '', inv.organization?.name || '', inv.organization?.type || '', inv.amountCents, inv.amountPaidCents || 0, inv.status, inv.currency, inv.dueDate?.toISOString() || '', inv.paidAt?.toISOString() || '', inv.createdAt.toISOString()].join(',')
    ).join('\n');
    res!.setHeader('Content-Type', 'text/csv');
    res!.setHeader('Content-Disposition', `attachment; filename=invoices-${Date.now()}.csv`);
    res!.send(header + rows);
  }
}
