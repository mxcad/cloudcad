import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { BillingController, BillingAdminController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { BillingService } from './billing.service';
import { BillingCron } from './billing-cron.service';
import { PlansService } from './plans.service';
import { MembershipService } from './membership.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MockPaymentGateway } from './gateway/mock/mock-payment.gateway';
import { WechatPayGateway } from './gateway/wechat-pay/wechat-pay.gateway';

@Module({
  imports: [CommonModule, ConfigModule, DatabaseModule, RuntimeConfigModule],
  controllers: [BillingController, BillingAdminController, WebhookController],
  providers: [
    BillingService,
    BillingCron,
    PlansService,
    MembershipService,
    PaymentGatewayFactory,
    MockPaymentGateway,
    WechatPayGateway,
  ],
  exports: [BillingService, PlansService, MembershipService],
})
export class BillingModule {}
