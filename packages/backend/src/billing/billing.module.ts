import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageQuotaModule } from '../file-system/storage-quota/storage-quota.module';
import { AlertModule } from '../alert/alert.module';
import { TaskRunModule } from '../task-run/task-run.module';
import { NotificationModule } from '../notification/notification.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { BillingController, BillingAdminController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { BillingService } from './billing.service';
import { BillingCron } from './billing-cron.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MockPaymentGateway } from './gateway/mock/mock-payment.gateway';
import { WechatPayGateway } from './gateway/wechat-pay/wechat-pay.gateway';

@Module({
  imports: [CommonModule, ConfigModule, DatabaseModule, RuntimeConfigModule, PermissionModule, StorageQuotaModule, AlertModule, TaskRunModule, NotificationModule, AuditLogModule],
  controllers: [BillingController, BillingAdminController, WebhookController],
  providers: [
    BillingService,
    BillingCron,
    PaymentGatewayFactory,
    MockPaymentGateway,
    WechatPayGateway,
  ],
  exports: [BillingService],
})
export class BillingModule {}
