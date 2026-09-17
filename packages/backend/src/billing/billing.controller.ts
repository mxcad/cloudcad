import { Controller, Get, Post, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { BillingService } from './billing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AutoCreateOrderDto } from './dto/auto-create-order.dto';
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
import { AccountRateLimitService } from '../auth/services/account-rate-limit.service';
import { getClientIp } from '../common/utils/client-ip';

/** 认证请求（替换 req: any，与 admin-mfa 等控制器模式一致） */
type BillingRequest = ExpressRequest & { user: { id: string } };

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private accountRateLimitService: AccountRateLimitService,
  ) {}

  /**
   * 下单前共享上下文：用户维度限流 + IP 提取。
   * createOrder / autoCreateOrder 共用，避免重复。
   */
  private async prepareOrderContext(
    req: BillingRequest,
  ): Promise<{ userId: string; ip: string }> {
    const userId = req.user.id;
    // 用户维度限流：防脚本刷单消耗微信 API 配额（ADR-0066 / 等保 8.1.4.1 c)）
    await this.accountRateLimitService.checkLimit('order_create', userId);
    const ip = getClientIp(req);
    return { userId, ip };
  }

  @Get('membership')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前会员信息' })
  async getMembership(@Req() req: BillingRequest) {
    return this.billingService.getUserMembership(req.user.id);
  }

  @Get('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单历史' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  async getOrders(
    @Req() req: BillingRequest,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.billingService.getUserOrders(
      req.user.id,
      query.page,
      query.limit,
      query.status,
      query.keyword,
    );
  }

  @Post('orders')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '创建订单' })
  @ApiResponse({
    status: 201,
    description: '创建成功，返回支付所需参数',
    type: OrderResponseDto,
  })
  async createOrder(
    @Req() req: BillingRequest,
    @Body() dto: CreateOrderDto,
  ) {
    const { userId, ip } = await this.prepareOrderContext(req);
    return this.billingService.createOrder(userId, { ...dto, ip });
  }

  @Post('orders/auto')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '自动下单（默认档位+时长，EXE 一键购买）' })
  @ApiResponse({
    status: 201,
    description: '创建成功，返回支付所需参数',
    type: OrderResponseDto,
  })
  async autoCreateOrder(
    @Req() req: BillingRequest,
    @Body() dto: AutoCreateOrderDto,
  ) {
    const { userId, ip } = await this.prepareOrderContext(req);
    return this.billingService.autoCreateOrder(userId, dto, ip);
  }

  @Post('orders/:orderNo/query')
  @ApiBearerAuth()
  @ApiOperation({ summary: '查单兜底' })
  async queryOrder(
    @Req() req: BillingRequest,
    @Param('orderNo') orderNo: string,
  ) {
    return this.billingService.refreshOrder(req.user.id, orderNo);
  }

  @Post('orders/:orderNo/repay')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '重新支付（用于订单过期后重新获取支付参数）' })
  @ApiResponse({
    status: 201,
    description: '重新获取支付参数成功',
    type: OrderResponseDto,
  })
  async repayOrder(
    @Req() req: BillingRequest,
    @Param('orderNo') orderNo: string,
    @Body() dto: RepayOrderDto,
  ) {
    const ip = getClientIp(req);
    return this.billingService.repayOrder(req.user.id, orderNo, {
      ...dto,
      ip,
    });
  }

  @Post('orders/:orderNo/refund-apply')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '申请退款（会员中心历史订单）' })
  @ApiResponse({ status: 201, description: '申请成功' })
  async applyRefund(
    @Req() req: BillingRequest,
    @Param('orderNo') orderNo: string,
    @Body() dto: ApplyRefundDto,
  ) {
    return this.billingService.applyRefund(
      req.user.id,
      orderNo,
      dto.reason,
    );
  }

  @Post('orders/:orderNo/mock-scan')
  @ApiBearerAuth()
  @ApiOperation({ summary: '模拟支付（仅 mock 模式）' })
  async mockScan(
    @Req() req: BillingRequest,
    @Param('orderNo') orderNo: string,
  ) {
    return this.billingService.mockScan(req.user.id, orderNo);
  }

  @Get('orders/:orderNo')
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询单个订单' })
  async getOrder(
    @Req() req: BillingRequest,
    @Param('orderNo') orderNo: string,
  ) {
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
    return this.billingService.getAllOrders(
      query.page,
      query.limit,
      query.status,
      query.keyword,
    );
  }

  @Post('refund')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '退款' })
  @ApiResponse({
    status: 201,
    description: '退款成功',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
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
  async getRefundApplications(
    @Query() query: ListRefundApplicationsQueryDto,
  ) {
    return this.billingService.listRefundApplications(
      query.page,
      query.limit,
      query.status,
    );
  }

  @Post('refund-applications/:id/approve')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '审核通过退款申请（立即执行退款）' })
  @ApiResponse({
    status: 201,
    description: '审核通过并完成退款',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  async approveRefundApplication(
    @Req() req: BillingRequest,
    @Param('id') id: string,
    @Body() dto: ReviewRefundDto,
  ) {
    await this.billingService.approveRefundApplication(
      id,
      req.user.id,
      dto.note,
      dto.revertMembership,
    );
    return { success: true };
  }

  @Post('refund-applications/:id/reject')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '驳回退款申请' })
  @ApiResponse({
    status: 201,
    description: '驳回成功',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  async rejectRefundApplication(
    @Req() req: BillingRequest,
    @Param('id') id: string,
    @Body() dto: ReviewRefundDto,
  ) {
    await this.billingService.rejectRefundApplication(
      id,
      req.user.id,
      dto.note,
    );
    return { success: true };
  }

  @Post('manual-complete')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @Throttle({ default: { limit: 3, ttl: 10000 } })
  @ApiOperation({ summary: '手动补单（用户已付但订单未完成时触发）' })
  @ApiResponse({
    status: 201,
    description: '补单成功',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  async manualComplete(@Body() dto: ManualCompleteDto) {
    await this.billingService.manualComplete(dto.orderNo);
    return { success: true };
  }
}
