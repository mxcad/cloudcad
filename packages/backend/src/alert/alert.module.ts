import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { WebhookService } from './webhook/webhook.service';
import { DatabaseModule } from '../database/database.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [DatabaseModule, PermissionModule],
  controllers: [AlertController],
  providers: [AlertService, WebhookService],
  exports: [AlertService, WebhookService],
})
export class AlertModule {}
