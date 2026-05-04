///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, InternalServerErrorException, Logger, } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
let PersonalSpaceService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PersonalSpaceService = _classThis = class {
        constructor(database) {
            this.database = database;
            this.logger = new Logger(PersonalSpaceService.name);
        }
        /**
         * 创建私人空间
         */
        async createPersonalSpace(userId) {
            const ownerRole = await this.database.projectRole.findFirst({
                where: { name: 'PROJECT_OWNER', isSystem: true },
            });
            if (!ownerRole) {
                throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
            }
            return this.database.fileSystemNode.create({
                data: {
                    name: '我的图纸',
                    isFolder: true,
                    isRoot: true,
                    personalSpaceKey: userId,
                    projectStatus: ProjectStatus.ACTIVE,
                    ownerId: userId,
                    projectMembers: {
                        create: {
                            userId,
                            projectRoleId: ownerRole.id,
                        },
                    },
                },
            });
        }
        /**
         * 获取用户私人空间（不存在则自动创建）
         */
        async getPersonalSpace(userId) {
            const personalSpace = await this.database.fileSystemNode.findUnique({
                where: { personalSpaceKey: userId },
            });
            if (!personalSpace) {
                this.logger.warn(`用户 ${userId} 没有私人空间，尝试创建`);
                return this.createPersonalSpace(userId);
            }
            return personalSpace;
        }
        /**
         * 判断节点是否为私人空间
         */
        isPersonalSpace(personalSpaceKey) {
            return personalSpaceKey !== null;
        }
    };
    __setFunctionName(_classThis, "PersonalSpaceService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PersonalSpaceService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PersonalSpaceService = _classThis;
})();
export { PersonalSpaceService };
//# sourceMappingURL=personal-space.service.js.map