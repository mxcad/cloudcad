///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块
// 依赖：CommonModule(DB/Redis 全局 + CLS)、PermissionModule(PermissionsGuard 依赖)、
//       RolesModule、AuditLogModule(@Audit 日志实例)、VipModule(MembershipService)、
//       RuntimeConfigModule(feedback.* 键读取)
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { RolesModule } from '../roles/roles.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { VipModule } from '../vip/vip.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { PublicFileModule } from '../public-file/public-file.module';
import { MxcadInfraModule } from '../mxcad/infra/mxcad-infra.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackAdminController } from './feedback-admin.controller';
import { FeedbackAttachmentController } from './feedback-attachment.controller';
import { FeedbackAttachmentAdminController } from './feedback-attachment-admin.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRewardService } from './feedback-reward.service';
import { FeedbackRateLimitService } from './feedback-rate-limit.service';
import { FeedbackAttachmentService } from './feedback-attachment.service';

@Module({
  imports: [
    CommonModule,
    PermissionModule,
    RolesModule,
    AuditLogModule,
    VipModule,
    RuntimeConfigModule,
    PublicFileModule,
    MxcadInfraModule,
  ],
  controllers: [
    FeedbackController,
    // 附件管理路由（admin/feedback/attachments）必须先于 FeedbackAdminController 的
    // admin/feedback/:id 注册，否则 Express 按注册顺序匹配，:id 会吞掉 /attachments
    FeedbackAttachmentAdminController,
    FeedbackAdminController,
    FeedbackAttachmentController,
  ],
  providers: [
    FeedbackService,
    FeedbackRewardService,
    FeedbackRateLimitService,
    FeedbackAttachmentService,
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
