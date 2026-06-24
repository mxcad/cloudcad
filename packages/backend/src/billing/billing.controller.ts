import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BillingService } from './billing.service';
import { PlansService } from './plans.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RefundDto } from './dto/refund.dto';
import { MockCallbackDto } from './dto/mock-callback.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ListOrdersQueryDto } from './dto/order-query.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private plansService: PlansService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: '套餐列表' })
  async getPlans() {
    return this.billingService.getPlans();
  }

  @Get('membership')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前会员信息' })
  async getMembership(@Req() req: any) {
    return this.billingService.getUserMembership(req.user.id);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单历史' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOrders(@Req() req: any, @Query() query: ListOrdersQueryDto) {
    return this.billingService.getUserOrders(req.user.id, query.page, query.limit);
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '创建订单' })
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    return this.billingService.createOrder(req.user.id, { ...dto, ip });
  }

  @Post('orders/:orderNo/query')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查单兜底' })
  async queryOrder(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.refreshOrder(req.user.id, orderNo);
  }

  @Post('orders/:orderNo/mock-scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '模拟支付（仅 mock 模式）' })
  async mockScan(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.mockScan(req.user.id, orderNo);
  }

  @Get('orders/:orderNo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询单个订单' })
  async getOrder(@Req() req: any, @Param('orderNo') orderNo: string) {
    return this.billingService.queryOrder(req.user.id, orderNo);
  }
}

@ApiTags('Billing Admin')
@Controller('admin/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class BillingAdminController {
  constructor(
    private billingService: BillingService,
    private plansService: PlansService,
  ) {}

  @Get('orders')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有订单（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllOrders(@Query() query: ListOrdersQueryDto) {
    return this.billingService.getAllOrders(query.page, query.limit);
  }

  @Get('plans')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_READ])
  @ApiOperation({ summary: '所有套餐（含已下架）' })
  async getAllPlans() {
    return this.plansService.getAllPlans();
  }

  @Put('plans/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '修改套餐' })
  async updatePlan(@Param('id') id: string, @Body() data: UpdatePlanDto) {
    return this.plansService.updatePlan(id, data);
  }

  @Post('plans')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '新增套餐' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async createPlan(@Body() data: CreatePlanDto) {
    return this.plansService.createPlan(data);
  }

  @Delete('plans/:id')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '下架套餐' })
  async deactivatePlan(@Param('id') id: string) {
    return this.plansService.deactivatePlan(id);
  }

  @Post('refund')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @ApiOperation({ summary: '退款' })
  async refund(@Body() dto: RefundDto) {
    await this.billingService.refund(dto.orderNo, dto.reason);
    return { success: true };
  }

  @Post('mock-callback')
  @RequirePermissions([SystemPermission.SYSTEM_BILLING_WRITE])
  @Throttle({ default: { limit: 3, ttl: 10000 } })
  @ApiOperation({ summary: '模拟支付回调（仅 mock 模式）' })
  async mockCallback(@Body() dto: MockCallbackDto) {
    await this.billingService.handleMockCallback(dto.orderNo);
    return { success: true };
  }
}
