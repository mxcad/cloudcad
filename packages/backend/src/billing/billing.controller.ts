import { Controller, Get, Post, Param, Body, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BillingService } from './billing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RepayOrderDto } from './dto/repay-order.dto';
import { RefundDto } from './dto/refund.dto';
import { ManualCompleteDto } from './dto/manual-complete.dto';
import { ApplyRefundDto } from './dto/apply-refund.dto';
import { ReviewRefundDto } from './dto/review-refund.dto';
import { ListOrdersQueryDto } from './dto/order-query.dto';
import { ListRefundApplicationsQueryDto } from './dto/refund-application-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderStatus, RefundApplicationStatus } from './enums/billing.enum';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
  ) {}

  @Get('membership')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前会员信息' })
  async getMembership(@Req() req: any) {
    return this.billingService.getUserMembership(req.user.id);
  }

  @Get('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单历史' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  async getOrders(@Req() req: any, @Query() query: ListOrdersQueryDto) {
    return this.billingService.getUserOrders(req.user.id, query.page, query.limit, query.status, query.keyword);
  }

  @Post('orders')
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '创建订单' })
  @ApiResponse({ status: 201, description: '创建成功，返回支付所需参数', type: OrderResponseDto })
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    return this.billingService.createOrder(req.user.id, { ...dto, ip });
  }

  @Post('orders/:orderNo/query')
  @ApiBearerAuth()
  @ApiOperation({ summary: '查单兜底' })
  async queryOrder(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.refreshOrder(req.user.id, orderNo);
  }

  @Post('orders/:orderNo/repay')
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '重新支付（用于订单过期后重新获取支付参数）' })
  @ApiResponse({ status: 201, description: '重新获取支付参数成功', type: OrderResponseDto })
  async repayOrder(@Req() req: any, @Param('orderNo') orderNo: string, @Body() dto: RepayOrderDto) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    return this.billingService.repayOrder(req.user.id, orderNo, { ...dto, ip });
  }

  @Post('orders/:orderNo/refund-apply')
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '申请退款（会员中心历史订单）' })
  @ApiResponse({ status: 201, description: '申请成功' })
  async applyRefund(
    @Req() req: any,
    @Param('orderNo') orderNo: string,
    @Body() dto: ApplyRefundDto
  ) {
    return this.billingService.applyRefund(req.user.id, orderNo, dto.reason);
  }

  @Post('orders/:orderNo/mock-scan')
  @ApiBearerAuth()
  @ApiOperation({ summary: '模拟支付（仅 mock 模式）' })
  async mockScan(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.mockScan(req.user.id, orderNo);
  }

  @Get('orders/:orderNo')
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询单个订单' })
  async getOrder(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.queryOrder(req.user.id, orderNo);
  }
}

@ApiTags('Billing Admin')
@Controller('admin/billing')
@UseGuards(PermissionsGuard)
@ApiBearerAuth()
export class BillingAdminController {
  constructor(
    private billingService: BillingService,
  ) {}

  @Get('orders')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有订单（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  async getAllOrders(@Query() query: ListOrdersQueryDto) {
    return this.billingService.getAllOrders(query.page, query.limit, query.status, query.keyword);
  }

  @Post('refund')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '退款' })
  @ApiResponse({ status: 201, description: '退款成功', schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async refund(@Body() dto: RefundDto) {
    await this.billingService.refund(dto.orderNo, dto.reason);
    return { success: true };
  }

  @Get('refund-applications')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '退款申请列表（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: RefundApplicationStatus })
  async getRefundApplications(@Query() query: ListRefundApplicationsQueryDto) {
    return this.billingService.listRefundApplications(
      query.page,
      query.limit,
      query.status
    );
  }

  @Post('refund-applications/:id/approve')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '审核通过退款申请（立即执行退款）' })
  @ApiResponse({ status: 201, description: '审核通过并完成退款', schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async approveRefundApplication(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewRefundDto
  ) {
    await this.billingService.approveRefundApplication(
      id,
      req.user.id,
      dto.note,
      dto.revertMembership
    );
    return { success: true };
  }

  @Post('refund-applications/:id/reject')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '驳回退款申请' })
  @ApiResponse({ status: 201, description: '驳回成功', schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async rejectRefundApplication(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewRefundDto
  ) {
    await this.billingService.rejectRefundApplication(
      id,
      req.user.id,
      dto.note
    );
    return { success: true };
  }

  @Post('manual-complete')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @Throttle({ default: { limit: 3, ttl: 10000 } })
  @ApiOperation({ summary: '手动补单（用户已付但订单未完成时触发）' })
  @ApiResponse({ status: 201, description: '补单成功', schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async manualComplete(@Body() dto: ManualCompleteDto) {
    await this.billingService.manualComplete(dto.orderNo);
    return { success: true };
  }
}
