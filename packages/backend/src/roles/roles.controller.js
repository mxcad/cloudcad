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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Controller, Get, Post, Patch, Delete, HttpCode, HttpStatus, UseGuards, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { RoleDto, ProjectRoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
let RolesController = (() => {
    let _classDecorators = [ApiTags('roles'), Controller('roles'), UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard), ApiBearerAuth()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _findAll_decorators;
    let _findOne_decorators;
    let _getRolePermissions_decorators;
    let _addPermissions_decorators;
    let _removePermissions_decorators;
    let _create_decorators;
    let _update_decorators;
    let _remove_decorators;
    let _getAllProjectRoles_decorators;
    let _getSystemProjectRoles_decorators;
    let _getProjectRolesByProject_decorators;
    let _getProjectRolePermissions_decorators;
    let _createProjectRole_decorators;
    let _updateProjectRole_decorators;
    let _deleteProjectRole_decorators;
    let _addProjectRolePermissions_decorators;
    let _removeProjectRolePermissions_decorators;
    var RolesController = _classThis = class {
        constructor(rolesService, projectRolesService) {
            this.rolesService = (__runInitializers(this, _instanceExtraInitializers), rolesService);
            this.projectRolesService = projectRolesService;
        }
        async findAll() {
            return await this.rolesService.findAll();
        }
        async findOne(id) {
            return await this.rolesService.findOne(id);
        }
        async getRolePermissions(id) {
            return await this.rolesService.getRolePermissions(id);
        }
        async addPermissions(id, body) {
            return await this.rolesService.addPermissions(id, body.permissions);
        }
        async removePermissions(id, body) {
            return await this.rolesService.removePermissions(id, body.permissions);
        }
        async create(createRoleDto) {
            return await this.rolesService.create(createRoleDto);
        }
        async update(id, updateRoleDto) {
            return await this.rolesService.update(id, updateRoleDto);
        }
        async remove(id) {
            await this.rolesService.remove(id);
            return { message: '角色已删除' };
        }
        async getAllProjectRoles() {
            return await this.projectRolesService.findAll();
        }
        async getSystemProjectRoles() {
            return await this.projectRolesService.findSystemRoles();
        }
        async getProjectRolesByProject(projectId) {
            return await this.projectRolesService.findByProject(projectId);
        }
        async getProjectRolePermissions(id) {
            return await this.projectRolesService.getRolePermissions(id);
        }
        async createProjectRole(dto, req) {
            return await this.projectRolesService.create(dto, req.user?.id);
        }
        async updateProjectRole(id, dto, req) {
            return await this.projectRolesService.update(id, dto, req.user?.id);
        }
        async deleteProjectRole(id, req) {
            await this.projectRolesService.delete(id, req.user?.id);
            return { message: '项目角色已删除' };
        }
        async addProjectRolePermissions(id, body, req) {
            await this.projectRolesService.assignPermissions(id, body.permissions, req.user?.id);
            return await this.projectRolesService.findOne(id);
        }
        async removeProjectRolePermissions(id, body, req) {
            await this.projectRolesService.removePermissions(id, body.permissions, req.user?.id);
            return await this.projectRolesService.findOne(id);
        }
    };
    __setFunctionName(_classThis, "RolesController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _findAll_decorators = [Get(), ApiOperation({ summary: '获取所有角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取角色列表',
                type: [RoleDto],
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])];
        _findOne_decorators = [Get(':id'), ApiOperation({ summary: '根据 ID 获取角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取角色',
                type: RoleDto,
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])];
        _getRolePermissions_decorators = [Get(':id/permissions'), ApiOperation({ summary: '获取角色的所有权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取角色权限',
                type: [String],
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])];
        _addPermissions_decorators = [Post(':id/permissions'), ApiOperation({ summary: '为角色分配权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功分配权限',
                type: RoleDto,
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])];
        _removePermissions_decorators = [Delete(':id/permissions'), ApiOperation({ summary: '从角色移除权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功移除权限',
                type: RoleDto,
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])];
        _create_decorators = [Post(), ApiOperation({ summary: '创建新角色' }), ApiResponse({
                status: HttpStatus.CREATED,
                description: '成功创建角色',
                type: RoleDto,
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE])];
        _update_decorators = [Patch(':id'), ApiOperation({ summary: '更新角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功更新角色',
                type: RoleDto,
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_UPDATE])];
        _remove_decorators = [Delete(':id'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '删除角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功删除角色',
            }), RequirePermissions([SystemPermission.SYSTEM_ROLE_DELETE])];
        _getAllProjectRoles_decorators = [Get('project-roles/all'), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ]), ApiOperation({ summary: '获取所有项目角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取所有项目角色列表',
                type: [ProjectRoleDto],
            })];
        _getSystemProjectRoles_decorators = [Get('project-roles/system'), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ]), ApiOperation({ summary: '获取系统默认项目角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取系统默认项目角色列表（仅返回 isSystem=true 的角色）',
                type: [ProjectRoleDto],
            })];
        _getProjectRolesByProject_decorators = [Get('project-roles/project/:projectId'), ApiOperation({ summary: '获取特定项目的角色列表' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取项目角色列表（包含系统角色和项目自定义角色）',
                type: [ProjectRoleDto],
            })];
        _getProjectRolePermissions_decorators = [Get('project-roles/:id/permissions'), RequirePermissions([SystemPermission.SYSTEM_ROLE_READ]), ApiOperation({ summary: '获取项目角色的所有权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取角色权限',
                type: [String],
            })];
        _createProjectRole_decorators = [Post('project-roles'), RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE]), ApiOperation({ summary: '创建项目角色' }), ApiResponse({
                status: HttpStatus.CREATED,
                description: '成功创建项目角色',
                type: ProjectRoleDto,
            })];
        _updateProjectRole_decorators = [Patch('project-roles/:id'), RequirePermissions([SystemPermission.SYSTEM_ROLE_UPDATE]), ApiOperation({ summary: '更新项目角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功更新项目角色',
                type: ProjectRoleDto,
            })];
        _deleteProjectRole_decorators = [Delete('project-roles/:id'), RequirePermissions([SystemPermission.SYSTEM_ROLE_DELETE]), HttpCode(HttpStatus.OK), ApiOperation({ summary: '删除项目角色' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功删除项目角色',
            })];
        _addProjectRolePermissions_decorators = [Post('project-roles/:id/permissions'), RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE]), ApiOperation({ summary: '为项目角色分配权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功分配权限',
            })];
        _removeProjectRolePermissions_decorators = [Delete('project-roles/:id/permissions'), RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE]), ApiOperation({ summary: '从项目角色移除权限' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功移除权限',
            })];
        __esDecorate(_classThis, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getRolePermissions_decorators, { kind: "method", name: "getRolePermissions", static: false, private: false, access: { has: obj => "getRolePermissions" in obj, get: obj => obj.getRolePermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _addPermissions_decorators, { kind: "method", name: "addPermissions", static: false, private: false, access: { has: obj => "addPermissions" in obj, get: obj => obj.addPermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _removePermissions_decorators, { kind: "method", name: "removePermissions", static: false, private: false, access: { has: obj => "removePermissions" in obj, get: obj => obj.removePermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _remove_decorators, { kind: "method", name: "remove", static: false, private: false, access: { has: obj => "remove" in obj, get: obj => obj.remove }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getAllProjectRoles_decorators, { kind: "method", name: "getAllProjectRoles", static: false, private: false, access: { has: obj => "getAllProjectRoles" in obj, get: obj => obj.getAllProjectRoles }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSystemProjectRoles_decorators, { kind: "method", name: "getSystemProjectRoles", static: false, private: false, access: { has: obj => "getSystemProjectRoles" in obj, get: obj => obj.getSystemProjectRoles }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProjectRolesByProject_decorators, { kind: "method", name: "getProjectRolesByProject", static: false, private: false, access: { has: obj => "getProjectRolesByProject" in obj, get: obj => obj.getProjectRolesByProject }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProjectRolePermissions_decorators, { kind: "method", name: "getProjectRolePermissions", static: false, private: false, access: { has: obj => "getProjectRolePermissions" in obj, get: obj => obj.getProjectRolePermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _createProjectRole_decorators, { kind: "method", name: "createProjectRole", static: false, private: false, access: { has: obj => "createProjectRole" in obj, get: obj => obj.createProjectRole }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateProjectRole_decorators, { kind: "method", name: "updateProjectRole", static: false, private: false, access: { has: obj => "updateProjectRole" in obj, get: obj => obj.updateProjectRole }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteProjectRole_decorators, { kind: "method", name: "deleteProjectRole", static: false, private: false, access: { has: obj => "deleteProjectRole" in obj, get: obj => obj.deleteProjectRole }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _addProjectRolePermissions_decorators, { kind: "method", name: "addProjectRolePermissions", static: false, private: false, access: { has: obj => "addProjectRolePermissions" in obj, get: obj => obj.addProjectRolePermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _removeProjectRolePermissions_decorators, { kind: "method", name: "removeProjectRolePermissions", static: false, private: false, access: { has: obj => "removeProjectRolePermissions" in obj, get: obj => obj.removeProjectRolePermissions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RolesController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RolesController = _classThis;
})();
export { RolesController };
//# sourceMappingURL=roles.controller.js.map