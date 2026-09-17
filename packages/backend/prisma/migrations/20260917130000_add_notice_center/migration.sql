-- 通用通知（部署公告 / 定向推送）。
-- kind/level 用 TEXT 而非枚举：公告类型会随业务增长，且 Prisma 枚举不能直接 @ApiProperty。
-- publishedAt=null AND retractedAt=null = 草稿；retractedAt!=null = 已下线。
-- notifiedAt 用于 CAS 抢占「推送过」状态，多实例部署下保证同一次状态迁移只 emit 一次。

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "autoExpire" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 覆盖读路径（getEffective：publishedAt 非空 + 时间窗）与两个 cron 查询
CREATE INDEX "notices_publishedAt_startAt_endAt_idx" ON "notices"("publishedAt", "startAt", "endAt");
