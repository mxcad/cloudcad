///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
/**
 * 审计日志服务
 *
 * 功能：
 * 1. 记录所有权限变更操作
 * 2. 记录所有访问操作
 * 3. 提供审计日志查询
 * 4. 提供审计日志导出
 */
let AuditLogService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuditLogService = _classThis = class {
        constructor(prisma) {
            this.prisma = prisma;
            this.logger = new Logger(AuditLogService.name);
        }
        /**
         * 记录审计日志
         *
         * @param action 操作类型
         * @param resourceType 资源类型
         * @param resourceId 资源 ID
         * @param userId 操作用户 ID
         * @param success 操作是否成功
         * @param errorMessage 错误信息（如果失败）
         * @param details 详细信息（JSON 格式）
         * @param ipAddress IP 地址
         * @param userAgent 用户代理
         */
        async log(action, resourceType, resourceId, userId, success, errorMessage, details, ipAddress, userAgent) {
            try {
                await this.prisma.auditLog.create({
                    data: {
                        action,
                        resourceType,
                        resourceId,
                        userId,
                        details,
                        ipAddress,
                        userAgent,
                        success,
                        errorMessage,
                    },
                });
                this.logger.debug(`审计日志记录: ${action} - ${resourceType} - ${resourceId} - ${userId} - ${success ? '成功' : '失败'}`);
            }
            catch (error) {
                const err = error;
                this.logger.error(`记录审计日志失败: ${err.message}`, err.stack);
                // 不抛出异常，避免影响主业务流程
            }
        }
        /**
      
           * 查询审计日志
      
           *
      
           * @param filters 过滤条件
      
           * @param pagination 分页参数
      
           * @returns 审计日志列表和总数
      
           */
        async findAll(filters, pagination) {
            const { page = 1, limit = 20 } = pagination;
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 20;
            const skip = (safePage - 1) * safeLimit;
            const where = {};
            if (filters.userId) {
                where.userId = filters.userId;
            }
            if (filters.action) {
                where.action = filters.action;
            }
            if (filters.resourceType) {
                where.resourceType = filters.resourceType;
            }
            if (filters.resourceId) {
                where.resourceId = filters.resourceId;
            }
            if (filters.startDate || filters.endDate) {
                where.createdAt = {};
                if (filters.startDate) {
                    where.createdAt.gte = filters.startDate;
                }
                if (filters.endDate) {
                    where.createdAt.lte = filters.endDate;
                }
            }
            if (filters.success !== undefined) {
                where.success = filters.success;
            }
            const [logs, total] = await Promise.all([
                this.prisma.auditLog.findMany({
                    where,
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                username: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    skip,
                    take: safeLimit,
                }),
                this.prisma.auditLog.count({ where }),
            ]);
            return {
                logs,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / safeLimit),
            };
        }
        /**
      
           * 获取审计日志详情
      
           *
      
           * @param id 日志 ID
      
           * @returns 审计日志详情
      
           */
        async findOne(id) {
            const log = await this.prisma.auditLog.findUnique({
                where: { id },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true,
                            nickname: true,
                        },
                    },
                },
            });
            if (!log) {
                throw new NotFoundException(`审计日志 ID ${id} 不存在`);
            }
            return log;
        }
        /**
      
           * 获取审计统计信息
      
           *
      
           * @param filters 过滤条件
      
           * @returns 统计信息
      
           */
        async getStatistics(filters) {
            const where = {};
            if (filters.userId) {
                where.userId = filters.userId;
            }
            if (filters.startDate || filters.endDate) {
                where.createdAt = {};
                if (filters.startDate) {
                    where.createdAt.gte = filters.startDate;
                }
                if (filters.endDate) {
                    where.createdAt.lte = filters.endDate;
                }
            }
            const [total, successCount, failureCount, actionCounts] = await Promise.all([
                this.prisma.auditLog.count({ where }),
                this.prisma.auditLog.count({ where: { ...where, success: true } }),
                this.prisma.auditLog.count({ where: { ...where, success: false } }),
                this.prisma.auditLog.groupBy({
                    by: ['action'],
                    where,
                    _count: true,
                }),
            ]);
            const actionStats = {};
            actionCounts.forEach((item) => {
                actionStats[item.action] = item._count;
            });
            return {
                total,
                successCount,
                failureCount,
                successRate: total > 0 ? (successCount / total) * 100 : 0,
                actionStats,
            };
        }
        /**
      
           * 清理旧审计日志
      
           *
      
           * @param daysToKeep 保留天数
      
           * @returns 删除的记录数
      
           */
        async cleanupOldLogs(daysToKeep, userId = 'unknown') {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const result = await this.prisma.auditLog.deleteMany({
                where: {
                    createdAt: {
                        lt: cutoffDate,
                    },
                },
            });
            this.logger.log(`用户 ${userId} 于 ${new Date().toISOString()} 执行了审计日志清理，删除了 ${result.count} 条记录`);
            return result.count;
        }
    };
    __setFunctionName(_classThis, "AuditLogService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuditLogService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuditLogService = _classThis;
})();
export { AuditLogService };
//# sourceMappingURL=audit-log.service.js.map