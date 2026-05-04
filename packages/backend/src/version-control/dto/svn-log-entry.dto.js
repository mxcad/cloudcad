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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SvnLogPathDto } from './svn-log-path.dto';
/**
 * SVN 提交记录条目 DTO
 */
let SvnLogEntryDto = (() => {
    var _a;
    let _revision_decorators;
    let _revision_initializers = [];
    let _revision_extraInitializers = [];
    let _author_decorators;
    let _author_initializers = [];
    let _author_extraInitializers = [];
    let _date_decorators;
    let _date_initializers = [];
    let _date_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _userName_decorators;
    let _userName_initializers = [];
    let _userName_extraInitializers = [];
    let _paths_decorators;
    let _paths_initializers = [];
    let _paths_extraInitializers = [];
    return _a = class SvnLogEntryDto {
            constructor() {
                this.revision = __runInitializers(this, _revision_initializers, void 0);
                this.author = (__runInitializers(this, _revision_extraInitializers), __runInitializers(this, _author_initializers, void 0));
                this.date = (__runInitializers(this, _author_extraInitializers), __runInitializers(this, _date_initializers, void 0));
                this.message = (__runInitializers(this, _date_extraInitializers), __runInitializers(this, _message_initializers, void 0));
                this.userName = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _userName_initializers, void 0));
                this.paths = (__runInitializers(this, _userName_extraInitializers), __runInitializers(this, _paths_initializers, void 0));
                __runInitializers(this, _paths_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _revision_decorators = [ApiProperty({
                    description: '修订版本号',
                    example: 123,
                })];
            _author_decorators = [ApiProperty({
                    description: '提交作者',
                    example: 'user@example.com',
                })];
            _date_decorators = [ApiProperty({
                    description: '提交日期',
                    type: 'string',
                    format: 'date-time',
                    example: '2026-03-03T10:30:00.000Z',
                })];
            _message_decorators = [ApiProperty({
                    description: '提交消息',
                    example: 'Update drawing file',
                })];
            _userName_decorators = [ApiPropertyOptional({
                    description: '提交用户名称（从提交信息中解析）',
                    example: '张三',
                })];
            _paths_decorators = [ApiPropertyOptional({
                    description: '变更路径列表',
                    type: () => [SvnLogPathDto],
                })];
            __esDecorate(null, null, _revision_decorators, { kind: "field", name: "revision", static: false, private: false, access: { has: obj => "revision" in obj, get: obj => obj.revision, set: (obj, value) => { obj.revision = value; } }, metadata: _metadata }, _revision_initializers, _revision_extraInitializers);
            __esDecorate(null, null, _author_decorators, { kind: "field", name: "author", static: false, private: false, access: { has: obj => "author" in obj, get: obj => obj.author, set: (obj, value) => { obj.author = value; } }, metadata: _metadata }, _author_initializers, _author_extraInitializers);
            __esDecorate(null, null, _date_decorators, { kind: "field", name: "date", static: false, private: false, access: { has: obj => "date" in obj, get: obj => obj.date, set: (obj, value) => { obj.date = value; } }, metadata: _metadata }, _date_initializers, _date_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _userName_decorators, { kind: "field", name: "userName", static: false, private: false, access: { has: obj => "userName" in obj, get: obj => obj.userName, set: (obj, value) => { obj.userName = value; } }, metadata: _metadata }, _userName_initializers, _userName_extraInitializers);
            __esDecorate(null, null, _paths_decorators, { kind: "field", name: "paths", static: false, private: false, access: { has: obj => "paths" in obj, get: obj => obj.paths, set: (obj, value) => { obj.paths = value; } }, metadata: _metadata }, _paths_initializers, _paths_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SvnLogEntryDto };
//# sourceMappingURL=svn-log-entry.dto.js.map