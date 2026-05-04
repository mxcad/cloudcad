///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation or related
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
import { Injectable, Logger, NotFoundException, } from '@nestjs/common';
import { SystemPermission } from '../common/enums/permissions.enum';
/**
 * 公共资源库服务
 *
 * 提供图纸库和图块库的管理功能
 * 复用文件系统的实现，通过 libraryKey 区分不同类型的库
 */
let LibraryService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var LibraryService = _classThis = class {
        constructor(prisma, fileSystemService, fileTreeService, permissionService) {
            this.prisma = prisma;
            this.fileSystemService = fileSystemService;
            this.fileTreeService = fileTreeService;
            this.permissionService = permissionService;
            this.logger = new Logger(LibraryService.name);
        }
        /**
         * 获取公共资源库项目 ID
         * @param libraryType 库类型：'drawing' | 'block'
         * @returns 库项目 ID
         */
        async getLibraryId(libraryType) {
            const library = await this.prisma.fileSystemNode.findFirst({
                where: {
                    libraryKey: libraryType,
                    isRoot: true,
                    deletedAt: null,
                },
                select: { id: true },
            });
            if (!library) {
                throw new NotFoundException(`公共资源库 (${libraryType}) 不存在，请先初始化`);
            }
            return library.id;
        }
        /**
         * 获取公共资源库项目信息
         * @param libraryType 库类型
         * @returns 库项目信息
         */
        async getLibrary(libraryType) {
            const libraryId = await this.getLibraryId(libraryType);
            return this.prisma.fileSystemNode.findUnique({
                where: { id: libraryId },
                include: {
                    children: {
                        where: {
                            deletedAt: null,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
        }
        /**
         * 检查是否是公共资源库
         * @param nodeId 节点 ID
         * @returns 是否是公共资源库
         */
        async isLibrary(nodeId) {
            const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);
            return libraryKey !== null;
        }
        /**
         * 获取库类型
         * @param nodeId 节点 ID
         * @returns 库类型或 null
         */
        async getLibraryType(nodeId) {
            return this.fileTreeService.getLibraryKey(nodeId);
        }
        /**
         * 检查用户是否有库管理权限
         * @param userId 用户 ID
         * @param libraryType 库类型
         * @returns 是否有管理权限
         */
        async hasLibraryManagePermission(userId, libraryType) {
            const requiredPermission = libraryType === 'drawing'
                ? SystemPermission.LIBRARY_DRAWING_MANAGE
                : SystemPermission.LIBRARY_BLOCK_MANAGE;
            return this.permissionService.checkSystemPermission(userId, requiredPermission);
        }
    };
    __setFunctionName(_classThis, "LibraryService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LibraryService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LibraryService = _classThis;
})();
export { LibraryService };
//# sourceMappingURL=library.service.js.map