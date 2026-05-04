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
import { PUBLIC_LIBRARY_PROVIDER_DRAWING, PUBLIC_LIBRARY_PROVIDER_BLOCK, } from '../interfaces/public-library-provider.interface';
let PublicLibraryService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PublicLibraryService = _classThis = class {
        constructor(prisma, fileSystemService, libraryType) {
            this.prisma = prisma;
            this.fileSystemService = fileSystemService;
            this.libraryType = libraryType;
            this.logger = new Logger(PublicLibraryService.name);
        }
        async getLibraryId() {
            const library = await this.prisma.fileSystemNode.findFirst({
                where: {
                    libraryKey: this.libraryType,
                    isRoot: true,
                    deletedAt: null,
                },
                select: { id: true },
            });
            if (!library) {
                throw new NotFoundException(`公共资源库 (${this.libraryType}) 不存在，请先初始化`);
            }
            return library.id;
        }
        async getRootNode() {
            const libraryId = await this.getLibraryId();
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
        async createFolder(dto) {
            const libraryId = await this.getLibraryId();
            const parentId = dto.parentId || libraryId;
            return this.fileSystemService.createFolder('system', parentId, dto);
        }
        async deleteNode(nodeId) {
            return this.fileSystemService.deleteNode(nodeId, true);
        }
    };
    __setFunctionName(_classThis, "PublicLibraryService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PublicLibraryService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PublicLibraryService = _classThis;
})();
export { PublicLibraryService };
export function createDrawingLibraryProvider(prisma, fileSystemService) {
    const service = new PublicLibraryService(prisma, fileSystemService, 'drawing');
    return {
        getLibraryId: () => service.getLibraryId(),
        getRootNode: () => service.getRootNode(),
        createFolder: (dto) => service.createFolder(dto),
        deleteNode: (nodeId) => service.deleteNode(nodeId),
    };
}
export function createBlockLibraryProvider(prisma, fileSystemService) {
    const service = new PublicLibraryService(prisma, fileSystemService, 'block');
    return {
        getLibraryId: () => service.getLibraryId(),
        getRootNode: () => service.getRootNode(),
        createFolder: (dto) => service.createFolder(dto),
        deleteNode: (nodeId) => service.deleteNode(nodeId),
    };
}
export { PUBLIC_LIBRARY_PROVIDER_DRAWING, PUBLIC_LIBRARY_PROVIDER_BLOCK, };
//# sourceMappingURL=public-library.service.js.map