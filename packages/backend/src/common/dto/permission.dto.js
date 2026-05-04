///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
import { ApiProperty } from '@nestjs/swagger';
/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export var SystemPermission;
(function (SystemPermission) {
    // ========== 用户管理 ==========
    /** 查看用户列表和用户详情 */
    SystemPermission["USER_READ"] = "SYSTEM_USER_READ";
    /** 创建用户 */
    SystemPermission["USER_CREATE"] = "SYSTEM_USER_CREATE";
    /** 编辑用户信息 */
    SystemPermission["USER_UPDATE"] = "SYSTEM_USER_UPDATE";
    /** 删除用户 */
    SystemPermission["USER_DELETE"] = "SYSTEM_USER_DELETE";
    // ========== 角色权限管理 ==========
    /** 查看角色列表和角色详情 */
    SystemPermission["ROLE_READ"] = "SYSTEM_ROLE_READ";
    /** 创建角色 */
    SystemPermission["ROLE_CREATE"] = "SYSTEM_ROLE_CREATE";
    /** 编辑角色信息 */
    SystemPermission["ROLE_UPDATE"] = "SYSTEM_ROLE_UPDATE";
    /** 删除角色 */
    SystemPermission["ROLE_DELETE"] = "SYSTEM_ROLE_DELETE";
    /** 为角色分配系统权限 */
    SystemPermission["ROLE_PERMISSION_MANAGE"] = "SYSTEM_ROLE_PERMISSION_MANAGE";
    // ========== 字体库管理 ==========
    /** 查看字体库列表和字体详情 */
    SystemPermission["FONT_READ"] = "SYSTEM_FONT_READ";
    /** 上传字体 */
    SystemPermission["FONT_UPLOAD"] = "SYSTEM_FONT_UPLOAD";
    /** 删除字体 */
    SystemPermission["FONT_DELETE"] = "SYSTEM_FONT_DELETE";
    /** 下载字体 */
    SystemPermission["FONT_DOWNLOAD"] = "SYSTEM_FONT_DOWNLOAD";
    // ========== 系统管理 ==========
    /** 系统管理员：拥有所有系统权限 */
    SystemPermission["SYSTEM_ADMIN"] = "SYSTEM_ADMIN";
    /** 系统监控：查看系统状态和日志 */
    SystemPermission["SYSTEM_MONITOR"] = "SYSTEM_MONITOR";
    // ========== 运行时配置管理 ==========
    /** 查看运行时配置 */
    SystemPermission["CONFIG_READ"] = "SYSTEM_CONFIG_READ";
    /** 修改运行时配置 */
    SystemPermission["CONFIG_WRITE"] = "SYSTEM_CONFIG_WRITE";
})(SystemPermission || (SystemPermission = {}));
/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制，与系统权限完全解耦
 */
export var ProjectPermission;
(function (ProjectPermission) {
    // ========== 项目管理权限 ==========
    /** 编辑项目信息 */
    ProjectPermission["PROJECT_UPDATE"] = "PROJECT_UPDATE";
    /** 删除项目 */
    ProjectPermission["PROJECT_DELETE"] = "PROJECT_DELETE";
    /** 项目成员管理（添加、移除成员） */
    ProjectPermission["PROJECT_MEMBER_MANAGE"] = "PROJECT_MEMBER_MANAGE";
    /** 项目成员角色分配 */
    ProjectPermission["PROJECT_MEMBER_ASSIGN"] = "PROJECT_MEMBER_ASSIGN";
    /** 项目角色增删改查 */
    ProjectPermission["PROJECT_ROLE_MANAGE"] = "PROJECT_ROLE_MANAGE";
    /** 项目角色权限分配 */
    ProjectPermission["PROJECT_ROLE_PERMISSION_MANAGE"] = "PROJECT_ROLE_PERMISSION_MANAGE";
    /** 转让项目所有权 */
    ProjectPermission["PROJECT_TRANSFER"] = "PROJECT_TRANSFER";
    // ========== 文件操作权限 ==========
    /** 创建文件/文件夹 */
    ProjectPermission["FILE_CREATE"] = "FILE_CREATE";
    /** 上传文件 */
    ProjectPermission["FILE_UPLOAD"] = "FILE_UPLOAD";
    /** 打开/预览CAD图纸 */
    ProjectPermission["FILE_OPEN"] = "FILE_OPEN";
    /** 编辑CAD图纸 */
    ProjectPermission["FILE_EDIT"] = "FILE_EDIT";
    /** 删除文件 */
    ProjectPermission["FILE_DELETE"] = "FILE_DELETE";
    /** 回收站管理（恢复、彻底删除） */
    ProjectPermission["FILE_TRASH_MANAGE"] = "FILE_TRASH_MANAGE";
    /** 下载文件 */
    ProjectPermission["FILE_DOWNLOAD"] = "FILE_DOWNLOAD";
    /** 分享文件 */
    ProjectPermission["FILE_SHARE"] = "FILE_SHARE";
    // ========== CAD 图纸权限 ==========
    /** 保存图纸（DWG/MXWEB） */
    ProjectPermission["CAD_SAVE"] = "CAD_SAVE";
    /** 管理外部参照 */
    ProjectPermission["CAD_EXTERNAL_REFERENCE"] = "CAD_EXTERNAL_REFERENCE";
    // ========== 版本管理权限 ==========
    /** 查看版本历史 */
    ProjectPermission["VERSION_READ"] = "VERSION_READ";
    /** 创建版本 */
    ProjectPermission["VERSION_CREATE"] = "VERSION_CREATE";
    /** 删除版本 */
    ProjectPermission["VERSION_DELETE"] = "VERSION_DELETE";
    /** 恢复版本 */
    ProjectPermission["VERSION_RESTORE"] = "VERSION_RESTORE";
    // ========== 项目设置权限 ==========
    /** 项目设置管理 */
    ProjectPermission["PROJECT_SETTINGS_MANAGE"] = "PROJECT_SETTINGS_MANAGE";
})(ProjectPermission || (ProjectPermission = {}));
/**
 * 系统权限 DTO
 * 用于在 Swagger 中暴露系统权限枚举
 */
let SystemPermissionDto = (() => {
    var _a;
    let _permission_decorators;
    let _permission_initializers = [];
    let _permission_extraInitializers = [];
    return _a = class SystemPermissionDto {
            constructor() {
                this.permission = __runInitializers(this, _permission_initializers, void 0);
                __runInitializers(this, _permission_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _permission_decorators = [ApiProperty({
                    enum: Object.values(SystemPermission),
                    description: '系统权限',
                    example: SystemPermission.USER_READ,
                    enumName: 'SystemPermissionEnum',
                })];
            __esDecorate(null, null, _permission_decorators, { kind: "field", name: "permission", static: false, private: false, access: { has: obj => "permission" in obj, get: obj => obj.permission, set: (obj, value) => { obj.permission = value; } }, metadata: _metadata }, _permission_initializers, _permission_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SystemPermissionDto };
/**
 * 项目权限 DTO
 * 用于在 Swagger 中暴露项目权限枚举
 */
let ProjectPermissionDto = (() => {
    var _a;
    let _permission_decorators;
    let _permission_initializers = [];
    let _permission_extraInitializers = [];
    return _a = class ProjectPermissionDto {
            constructor() {
                this.permission = __runInitializers(this, _permission_initializers, void 0);
                __runInitializers(this, _permission_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _permission_decorators = [ApiProperty({
                    enum: Object.values(ProjectPermission),
                    description: '项目权限',
                    example: ProjectPermission.FILE_UPLOAD,
                    enumName: 'ProjectPermissionEnum',
                })];
            __esDecorate(null, null, _permission_decorators, { kind: "field", name: "permission", static: false, private: false, access: { has: obj => "permission" in obj, get: obj => obj.permission, set: (obj, value) => { obj.permission = value; } }, metadata: _metadata }, _permission_initializers, _permission_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ProjectPermissionDto };
/**
 * 权限 DTO
 * 用于在 Swagger 中暴露统一权限枚举
 */
let PermissionDto = (() => {
    var _a;
    let _permission_decorators;
    let _permission_initializers = [];
    let _permission_extraInitializers = [];
    return _a = class PermissionDto {
            constructor() {
                this.permission = __runInitializers(this, _permission_initializers, void 0);
                __runInitializers(this, _permission_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _permission_decorators = [ApiProperty({
                    enum: [
                        ...Object.values(SystemPermission),
                        ...Object.values(ProjectPermission),
                    ],
                    description: '权限',
                    example: SystemPermission.USER_READ,
                    enumName: 'PermissionEnum',
                })];
            __esDecorate(null, null, _permission_decorators, { kind: "field", name: "permission", static: false, private: false, access: { has: obj => "permission" in obj, get: obj => obj.permission, set: (obj, value) => { obj.permission = value; } }, metadata: _metadata }, _permission_initializers, _permission_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PermissionDto };
//# sourceMappingURL=permission.dto.js.map