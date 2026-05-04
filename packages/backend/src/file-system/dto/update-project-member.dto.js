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
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
let UpdateProjectMemberDto = (() => {
    var _a;
    let _projectRoleId_decorators;
    let _projectRoleId_initializers = [];
    let _projectRoleId_extraInitializers = [];
    let _roleId_decorators;
    let _roleId_initializers = [];
    let _roleId_extraInitializers = [];
    return _a = class UpdateProjectMemberDto {
            constructor() {
                this.projectRoleId = __runInitializers(this, _projectRoleId_initializers, void 0);
                this.roleId = (__runInitializers(this, _projectRoleId_extraInitializers), __runInitializers(this, _roleId_initializers, void 0));
                __runInitializers(this, _roleId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _projectRoleId_decorators = [ApiProperty({ description: '项目角色ID', required: false }), IsString(), IsOptional()];
            _roleId_decorators = [ApiProperty({
                    description: '角色ID（兼容字段，与 projectRoleId 相同）',
                    required: false,
                }), IsString(), IsOptional()];
            __esDecorate(null, null, _projectRoleId_decorators, { kind: "field", name: "projectRoleId", static: false, private: false, access: { has: obj => "projectRoleId" in obj, get: obj => obj.projectRoleId, set: (obj, value) => { obj.projectRoleId = value; } }, metadata: _metadata }, _projectRoleId_initializers, _projectRoleId_extraInitializers);
            __esDecorate(null, null, _roleId_decorators, { kind: "field", name: "roleId", static: false, private: false, access: { has: obj => "roleId" in obj, get: obj => obj.roleId, set: (obj, value) => { obj.roleId = value; } }, metadata: _metadata }, _roleId_initializers, _roleId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UpdateProjectMemberDto };
//# sourceMappingURL=update-project-member.dto.js.map