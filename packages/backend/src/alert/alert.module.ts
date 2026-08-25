import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { WebhookService } from './webhook/webhook.service';
import { AlertNotificationService } from './notification/alert-notification.service';
import { DatabaseModule } from '../database/database.module';
import { PermissionModule } from '../permission/permission.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, PermissionModule, NotificationModule],
  controllers: [AlertController],
  providers: [AlertService, WebhookService, AlertNotificationService],
  exports: [AlertService, WebhookService],
})
export class AlertModule {}
