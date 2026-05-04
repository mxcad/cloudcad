///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
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
import { ApiProperty } from "@nestjs/swagger";
import { FileStatus, ProjectStatus } from "@prisma/client";
/**
 * 文件系统节点 DTO
 */
let FileSystemNodeDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _isFolder_decorators;
    let _isFolder_initializers = [];
    let _isFolder_extraInitializers = [];
    let _isRoot_decorators;
    let _isRoot_initializers = [];
    let _isRoot_extraInitializers = [];
    let _parentId_decorators;
    let _parentId_initializers = [];
    let _parentId_extraInitializers = [];
    let _path_decorators;
    let _path_initializers = [];
    let _path_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _mimeType_decorators;
    let _mimeType_initializers = [];
    let _mimeType_extraInitializers = [];
    let _fileHash_decorators;
    let _fileHash_initializers = [];
    let _fileHash_extraInitializers = [];
    let _fileStatus_decorators;
    let _fileStatus_initializers = [];
    let _fileStatus_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    let _deletedAt_decorators;
    let _deletedAt_initializers = [];
    let _deletedAt_extraInitializers = [];
    let _ownerId_decorators;
    let _ownerId_initializers = [];
    let _ownerId_extraInitializers = [];
    let _personalSpaceKey_decorators;
    let _personalSpaceKey_initializers = [];
    let _personalSpaceKey_extraInitializers = [];
    let _libraryKey_decorators;
    let _libraryKey_initializers = [];
    let _libraryKey_extraInitializers = [];
    let _childrenCount_decorators;
    let _childrenCount_initializers = [];
    let _childrenCount_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    return _a = class FileSystemNodeDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.name = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.isFolder = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _isFolder_initializers, void 0));
                this.isRoot = (__runInitializers(this, _isFolder_extraInitializers), __runInitializers(this, _isRoot_initializers, void 0));
                this.parentId = (__runInitializers(this, _isRoot_extraInitializers), __runInitializers(this, _parentId_initializers, void 0));
                this.path = (__runInitializers(this, _parentId_extraInitializers), __runInitializers(this, _path_initializers, void 0));
                this.size = (__runInitializers(this, _path_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.mimeType = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _mimeType_initializers, void 0));
                this.fileHash = (__runInitializers(this, _mimeType_extraInitializers), __runInitializers(this, _fileHash_initializers, void 0));
                this.fileStatus = (__runInitializers(this, _fileHash_extraInitializers), __runInitializers(this, _fileStatus_initializers, void 0));
                this.createdAt = (__runInitializers(this, _fileStatus_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                this.deletedAt = (__runInitializers(this, _updatedAt_extraInitializers), __runInitializers(this, _deletedAt_initializers, void 0));
                this.ownerId = (__runInitializers(this, _deletedAt_extraInitializers), __runInitializers(this, _ownerId_initializers, void 0));
                this.personalSpaceKey = (__runInitializers(this, _ownerId_extraInitializers), __runInitializers(this, _personalSpaceKey_initializers, void 0));
                this.libraryKey = (__runInitializers(this, _personalSpaceKey_extraInitializers), __runInitializers(this, _libraryKey_initializers, void 0));
                this.childrenCount = (__runInitializers(this, _libraryKey_extraInitializers), __runInitializers(this, _childrenCount_initializers, void 0));
                this.projectId = (__runInitializers(this, _childrenCount_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                __runInitializers(this, _projectId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: "节点 ID" })];
            _name_decorators = [ApiProperty({ description: "节点名称" })];
            _description_decorators = [ApiProperty({ description: "节点描述", required: false })];
            _isFolder_decorators = [ApiProperty({ description: "是否为文件夹" })];
            _isRoot_decorators = [ApiProperty({ description: "是否为根节点" })];
            _parentId_decorators = [ApiProperty({ description: "父节点 ID", required: false })];
            _path_decorators = [ApiProperty({ description: "文件路径", required: false })];
            _size_decorators = [ApiProperty({ description: "文件大小", required: false })];
            _mimeType_decorators = [ApiProperty({ description: "文件 MIME 类型", required: false })];
            _fileHash_decorators = [ApiProperty({ description: "文件哈希", required: false })];
            _fileStatus_decorators = [ApiProperty({
                    description: "文件状态",
                    enum: Object.values(FileStatus),
                    enumName: "FileStatusEnum",
                    required: false,
                })];
            _createdAt_decorators = [ApiProperty({ description: "创建时间" })];
            _updatedAt_decorators = [ApiProperty({ description: "更新时间" })];
            _deletedAt_decorators = [ApiProperty({ description: "删除时间", required: false })];
            _ownerId_decorators = [ApiProperty({ description: "所有者 ID" })];
            _personalSpaceKey_decorators = [ApiProperty({
                    description: "私人空间标识（非空表示为私人空间）",
                    required: false,
                })];
            _libraryKey_decorators = [ApiProperty({
                    description: "公共资源库标识（drawing: 图纸库, block: 图块库）",
                    required: false,
                })];
            _childrenCount_decorators = [ApiProperty({ description: "子节点数量", required: false })];
            _projectId_decorators = [ApiProperty({ description: "项目 ID", required: false })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _isFolder_decorators, { kind: "field", name: "isFolder", static: false, private: false, access: { has: obj => "isFolder" in obj, get: obj => obj.isFolder, set: (obj, value) => { obj.isFolder = value; } }, metadata: _metadata }, _isFolder_initializers, _isFolder_extraInitializers);
            __esDecorate(null, null, _isRoot_decorators, { kind: "field", name: "isRoot", static: false, private: false, access: { has: obj => "isRoot" in obj, get: obj => obj.isRoot, set: (obj, value) => { obj.isRoot = value; } }, metadata: _metadata }, _isRoot_initializers, _isRoot_extraInitializers);
            __esDecorate(null, null, _parentId_decorators, { kind: "field", name: "parentId", static: false, private: false, access: { has: obj => "parentId" in obj, get: obj => obj.parentId, set: (obj, value) => { obj.parentId = value; } }, metadata: _metadata }, _parentId_initializers, _parentId_extraInitializers);
            __esDecorate(null, null, _path_decorators, { kind: "field", name: "path", static: false, private: false, access: { has: obj => "path" in obj, get: obj => obj.path, set: (obj, value) => { obj.path = value; } }, metadata: _metadata }, _path_initializers, _path_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _mimeType_decorators, { kind: "field", name: "mimeType", static: false, private: false, access: { has: obj => "mimeType" in obj, get: obj => obj.mimeType, set: (obj, value) => { obj.mimeType = value; } }, metadata: _metadata }, _mimeType_initializers, _mimeType_extraInitializers);
            __esDecorate(null, null, _fileHash_decorators, { kind: "field", name: "fileHash", static: false, private: false, access: { has: obj => "fileHash" in obj, get: obj => obj.fileHash, set: (obj, value) => { obj.fileHash = value; } }, metadata: _metadata }, _fileHash_initializers, _fileHash_extraInitializers);
            __esDecorate(null, null, _fileStatus_decorators, { kind: "field", name: "fileStatus", static: false, private: false, access: { has: obj => "fileStatus" in obj, get: obj => obj.fileStatus, set: (obj, value) => { obj.fileStatus = value; } }, metadata: _metadata }, _fileStatus_initializers, _fileStatus_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, null, _deletedAt_decorators, { kind: "field", name: "deletedAt", static: false, private: false, access: { has: obj => "deletedAt" in obj, get: obj => obj.deletedAt, set: (obj, value) => { obj.deletedAt = value; } }, metadata: _metadata }, _deletedAt_initializers, _deletedAt_extraInitializers);
            __esDecorate(null, null, _ownerId_decorators, { kind: "field", name: "ownerId", static: false, private: false, access: { has: obj => "ownerId" in obj, get: obj => obj.ownerId, set: (obj, value) => { obj.ownerId = value; } }, metadata: _metadata }, _ownerId_initializers, _ownerId_extraInitializers);
            __esDecorate(null, null, _personalSpaceKey_decorators, { kind: "field", name: "personalSpaceKey", static: false, private: false, access: { has: obj => "personalSpaceKey" in obj, get: obj => obj.personalSpaceKey, set: (obj, value) => { obj.personalSpaceKey = value; } }, metadata: _metadata }, _personalSpaceKey_initializers, _personalSpaceKey_extraInitializers);
            __esDecorate(null, null, _libraryKey_decorators, { kind: "field", name: "libraryKey", static: false, private: false, access: { has: obj => "libraryKey" in obj, get: obj => obj.libraryKey, set: (obj, value) => { obj.libraryKey = value; } }, metadata: _metadata }, _libraryKey_initializers, _libraryKey_extraInitializers);
            __esDecorate(null, null, _childrenCount_decorators, { kind: "field", name: "childrenCount", static: false, private: false, access: { has: obj => "childrenCount" in obj, get: obj => obj.childrenCount, set: (obj, value) => { obj.childrenCount = value; } }, metadata: _metadata }, _childrenCount_initializers, _childrenCount_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { FileSystemNodeDto };
/**
 * 项目 DTO
 */
let ProjectDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _ownerId_decorators;
    let _ownerId_initializers = [];
    let _ownerId_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    let _deletedAt_decorators;
    let _deletedAt_initializers = [];
    let _deletedAt_extraInitializers = [];
    let _memberCount_decorators;
    let _memberCount_initializers = [];
    let _memberCount_extraInitializers = [];
    return _a = class ProjectDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.name = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.status = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.ownerId = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _ownerId_initializers, void 0));
                this.createdAt = (__runInitializers(this, _ownerId_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                this.deletedAt = (__runInitializers(this, _updatedAt_extraInitializers), __runInitializers(this, _deletedAt_initializers, void 0));
                this.memberCount = (__runInitializers(this, _deletedAt_extraInitializers), __runInitializers(this, _memberCount_initializers, void 0));
                __runInitializers(this, _memberCount_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: "项目 ID" })];
            _name_decorators = [ApiProperty({ description: "项目名称" })];
            _description_decorators = [ApiProperty({ description: "项目描述", required: false })];
            _status_decorators = [ApiProperty({
                    description: "项目状态",
                    enum: Object.values(ProjectStatus),
                    enumName: "ProjectStatusEnum",
                })];
            _ownerId_decorators = [ApiProperty({ description: "所有者 ID" })];
            _createdAt_decorators = [ApiProperty({ description: "创建时间" })];
            _updatedAt_decorators = [ApiProperty({ description: "更新时间" })];
            _deletedAt_decorators = [ApiProperty({ description: "删除时间", required: false })];
            _memberCount_decorators = [ApiProperty({ description: "成员数量", required: false })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _ownerId_decorators, { kind: "field", name: "ownerId", static: false, private: false, access: { has: obj => "ownerId" in obj, get: obj => obj.ownerId, set: (obj, value) => { obj.ownerId = value; } }, metadata: _metadata }, _ownerId_initializers, _ownerId_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, null, _deletedAt_decorators, { kind: "field", name: "deletedAt", static: false, private: false, access: { has: obj => "deletedAt" in obj, get: obj => obj.deletedAt, set: (obj, value) => { obj.deletedAt = value; } }, metadata: _metadata }, _deletedAt_initializers, _deletedAt_extraInitializers);
            __esDecorate(null, null, _memberCount_decorators, { kind: "field", name: "memberCount", static: false, private: false, access: { has: obj => "memberCount" in obj, get: obj => obj.memberCount, set: (obj, value) => { obj.memberCount = value; } }, metadata: _metadata }, _memberCount_initializers, _memberCount_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ProjectDto };
/**
 * 项目成员 DTO
 */
let ProjectMemberDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    let _avatar_decorators;
    let _avatar_initializers = [];
    let _avatar_extraInitializers = [];
    let _projectRoleId_decorators;
    let _projectRoleId_initializers = [];
    let _projectRoleId_extraInitializers = [];
    let _projectRoleName_decorators;
    let _projectRoleName_initializers = [];
    let _projectRoleName_extraInitializers = [];
    let _joinedAt_decorators;
    let _joinedAt_initializers = [];
    let _joinedAt_extraInitializers = [];
    return _a = class ProjectMemberDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.projectRoleId = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _projectRoleId_initializers, void 0));
                this.projectRoleName = (__runInitializers(this, _projectRoleId_extraInitializers), __runInitializers(this, _projectRoleName_initializers, void 0));
                this.joinedAt = (__runInitializers(this, _projectRoleName_extraInitializers), __runInitializers(this, _joinedAt_initializers, void 0));
                __runInitializers(this, _joinedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: "用户 ID" })];
            _email_decorators = [ApiProperty({ description: "用户邮箱" })];
            _username_decorators = [ApiProperty({ description: "用户名" })];
            _nickname_decorators = [ApiProperty({ description: "用户昵称", required: false })];
            _avatar_decorators = [ApiProperty({ description: "头像 URL", required: false })];
            _projectRoleId_decorators = [ApiProperty({ description: "项目角色 ID" })];
            _projectRoleName_decorators = [ApiProperty({ description: "项目角色名称" })];
            _joinedAt_decorators = [ApiProperty({ description: "加入时间" })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _projectRoleId_decorators, { kind: "field", name: "projectRoleId", static: false, private: false, access: { has: obj => "projectRoleId" in obj, get: obj => obj.projectRoleId, set: (obj, value) => { obj.projectRoleId = value; } }, metadata: _metadata }, _projectRoleId_initializers, _projectRoleId_extraInitializers);
            __esDecorate(null, null, _projectRoleName_decorators, { kind: "field", name: "projectRoleName", static: false, private: false, access: { has: obj => "projectRoleName" in obj, get: obj => obj.projectRoleName, set: (obj, value) => { obj.projectRoleName = value; } }, metadata: _metadata }, _projectRoleName_initializers, _projectRoleName_extraInitializers);
            __esDecorate(null, null, _joinedAt_decorators, { kind: "field", name: "joinedAt", static: false, private: false, access: { has: obj => "joinedAt" in obj, get: obj => obj.joinedAt, set: (obj, value) => { obj.joinedAt = value; } }, metadata: _metadata }, _joinedAt_initializers, _joinedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ProjectMemberDto };
/**
 * 统一分页列表响应 DTO - 所有列表接口都用这个格式
 */
let NodeListResponseDto = (() => {
    var _a;
    let _nodes_decorators;
    let _nodes_initializers = [];
    let _nodes_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _totalPages_decorators;
    let _totalPages_initializers = [];
    let _totalPages_extraInitializers = [];
    return _a = class NodeListResponseDto {
            constructor() {
                this.nodes = __runInitializers(this, _nodes_initializers, void 0);
                this.total = (__runInitializers(this, _nodes_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.page = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _page_initializers, void 0));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, void 0));
                this.totalPages = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _totalPages_initializers, void 0));
                __runInitializers(this, _totalPages_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _nodes_decorators = [ApiProperty({
                    description: "节点列表",
                    type: () => FileSystemNodeDto,
                    isArray: true,
                })];
            _total_decorators = [ApiProperty({ description: "总数" })];
            _page_decorators = [ApiProperty({ description: "当前页码" })];
            _limit_decorators = [ApiProperty({ description: "每页数量" })];
            _totalPages_decorators = [ApiProperty({ description: "总页数" })];
            __esDecorate(null, null, _nodes_decorators, { kind: "field", name: "nodes", static: false, private: false, access: { has: obj => "nodes" in obj, get: obj => obj.nodes, set: (obj, value) => { obj.nodes = value; } }, metadata: _metadata }, _nodes_initializers, _nodes_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _totalPages_decorators, { kind: "field", name: "totalPages", static: false, private: false, access: { has: obj => "totalPages" in obj, get: obj => obj.totalPages, set: (obj, value) => { obj.totalPages = value; } }, metadata: _metadata }, _totalPages_initializers, _totalPages_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { NodeListResponseDto };
/**
 * 项目列表响应 DTO - 现在它只是 NodeListResponseDto 的别名
 */
export class ProjectListResponseDto extends NodeListResponseDto {
}
/**
 * 节点树响应 DTO
 */
let NodeTreeResponseDto = (() => {
    var _a;
    let _classSuper = FileSystemNodeDto;
    let _children_decorators;
    let _children_initializers = [];
    let _children_extraInitializers = [];
    return _a = class NodeTreeResponseDto extends _classSuper {
            constructor() {
                super(...arguments);
                this.children = __runInitializers(this, _children_initializers, void 0);
                __runInitializers(this, _children_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _children_decorators = [ApiProperty({
                    description: "子节点",
                    type: () => [FileSystemNodeDto],
                    required: false,
                })];
            __esDecorate(null, null, _children_decorators, { kind: "field", name: "children", static: false, private: false, access: { has: obj => "children" in obj, get: obj => obj.children, set: (obj, value) => { obj.children = value; } }, metadata: _metadata }, _children_initializers, _children_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { NodeTreeResponseDto };
/**
 * 回收站项目 DTO
 */
let TrashItemDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _isFolder_decorators;
    let _isFolder_initializers = [];
    let _isFolder_extraInitializers = [];
    let _originalParentId_decorators;
    let _originalParentId_initializers = [];
    let _originalParentId_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _mimeType_decorators;
    let _mimeType_initializers = [];
    let _mimeType_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    let _deletedAt_decorators;
    let _deletedAt_initializers = [];
    let _deletedAt_extraInitializers = [];
    let _ownerId_decorators;
    let _ownerId_initializers = [];
    let _ownerId_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    return _a = class TrashItemDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.name = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.isFolder = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _isFolder_initializers, void 0));
                this.originalParentId = (__runInitializers(this, _isFolder_extraInitializers), __runInitializers(this, _originalParentId_initializers, void 0));
                this.size = (__runInitializers(this, _originalParentId_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.mimeType = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _mimeType_initializers, void 0));
                this.createdAt = (__runInitializers(this, _mimeType_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                this.deletedAt = (__runInitializers(this, _updatedAt_extraInitializers), __runInitializers(this, _deletedAt_initializers, void 0));
                this.ownerId = (__runInitializers(this, _deletedAt_extraInitializers), __runInitializers(this, _ownerId_initializers, void 0));
                this.projectId = (__runInitializers(this, _ownerId_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                __runInitializers(this, _projectId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: "节点 ID" })];
            _name_decorators = [ApiProperty({ description: "节点名称" })];
            _description_decorators = [ApiProperty({ description: "节点描述", required: false })];
            _isFolder_decorators = [ApiProperty({ description: "是否为文件夹" })];
            _originalParentId_decorators = [ApiProperty({ description: "原始父节点 ID" })];
            _size_decorators = [ApiProperty({ description: "文件大小", required: false })];
            _mimeType_decorators = [ApiProperty({ description: "文件 MIME 类型", required: false })];
            _createdAt_decorators = [ApiProperty({ description: "创建时间" })];
            _updatedAt_decorators = [ApiProperty({ description: "更新时间" })];
            _deletedAt_decorators = [ApiProperty({ description: "删除时间" })];
            _ownerId_decorators = [ApiProperty({ description: "所有者 ID" })];
            _projectId_decorators = [ApiProperty({ description: "项目 ID", required: false })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _isFolder_decorators, { kind: "field", name: "isFolder", static: false, private: false, access: { has: obj => "isFolder" in obj, get: obj => obj.isFolder, set: (obj, value) => { obj.isFolder = value; } }, metadata: _metadata }, _isFolder_initializers, _isFolder_extraInitializers);
            __esDecorate(null, null, _originalParentId_decorators, { kind: "field", name: "originalParentId", static: false, private: false, access: { has: obj => "originalParentId" in obj, get: obj => obj.originalParentId, set: (obj, value) => { obj.originalParentId = value; } }, metadata: _metadata }, _originalParentId_initializers, _originalParentId_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _mimeType_decorators, { kind: "field", name: "mimeType", static: false, private: false, access: { has: obj => "mimeType" in obj, get: obj => obj.mimeType, set: (obj, value) => { obj.mimeType = value; } }, metadata: _metadata }, _mimeType_initializers, _mimeType_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, null, _deletedAt_decorators, { kind: "field", name: "deletedAt", static: false, private: false, access: { has: obj => "deletedAt" in obj, get: obj => obj.deletedAt, set: (obj, value) => { obj.deletedAt = value; } }, metadata: _metadata }, _deletedAt_initializers, _deletedAt_extraInitializers);
            __esDecorate(null, null, _ownerId_decorators, { kind: "field", name: "ownerId", static: false, private: false, access: { has: obj => "ownerId" in obj, get: obj => obj.ownerId, set: (obj, value) => { obj.ownerId = value; } }, metadata: _metadata }, _ownerId_initializers, _ownerId_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { TrashItemDto };
/**
 * 回收站列表响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export class TrashListResponseDto extends NodeListResponseDto {
}
/**
 * 项目内回收站响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export class ProjectTrashResponseDto extends NodeListResponseDto {
}
/**
 * 操作成功响应 DTO
 */
let OperationSuccessDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _nodeId_decorators;
    let _nodeId_initializers = [];
    let _nodeId_extraInitializers = [];
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    return _a = class OperationSuccessDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                this.nodeId = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _nodeId_initializers, void 0));
                this.success = (__runInitializers(this, _nodeId_extraInitializers), __runInitializers(this, _success_initializers, void 0));
                __runInitializers(this, _success_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: "操作结果消息" })];
            _nodeId_decorators = [ApiProperty({ description: "受影响的节点 ID", required: false })];
            _success_decorators = [ApiProperty({ description: "是否成功" })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _nodeId_decorators, { kind: "field", name: "nodeId", static: false, private: false, access: { has: obj => "nodeId" in obj, get: obj => obj.nodeId, set: (obj, value) => { obj.nodeId = value; } }, metadata: _metadata }, _nodeId_initializers, _nodeId_extraInitializers);
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { OperationSuccessDto };
/**
 * 批量操作响应 DTO
 */
let BatchOperationResponseDto = (() => {
    var _a;
    let _successCount_decorators;
    let _successCount_initializers = [];
    let _successCount_extraInitializers = [];
    let _failedCount_decorators;
    let _failedCount_initializers = [];
    let _failedCount_extraInitializers = [];
    let _successIds_decorators;
    let _successIds_initializers = [];
    let _successIds_extraInitializers = [];
    let _failedIds_decorators;
    let _failedIds_initializers = [];
    let _failedIds_extraInitializers = [];
    let _errors_decorators;
    let _errors_initializers = [];
    let _errors_extraInitializers = [];
    return _a = class BatchOperationResponseDto {
            constructor() {
                this.successCount = __runInitializers(this, _successCount_initializers, void 0);
                this.failedCount = (__runInitializers(this, _successCount_extraInitializers), __runInitializers(this, _failedCount_initializers, void 0));
                this.successIds = (__runInitializers(this, _failedCount_extraInitializers), __runInitializers(this, _successIds_initializers, void 0));
                this.failedIds = (__runInitializers(this, _successIds_extraInitializers), __runInitializers(this, _failedIds_initializers, void 0));
                this.errors = (__runInitializers(this, _failedIds_extraInitializers), __runInitializers(this, _errors_initializers, void 0));
                __runInitializers(this, _errors_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _successCount_decorators = [ApiProperty({ description: "成功数量" })];
            _failedCount_decorators = [ApiProperty({ description: "失败数量" })];
            _successIds_decorators = [ApiProperty({ description: "成功 ID 列表" })];
            _failedIds_decorators = [ApiProperty({ description: "失败 ID 列表" })];
            _errors_decorators = [ApiProperty({ description: "错误信息", required: false })];
            __esDecorate(null, null, _successCount_decorators, { kind: "field", name: "successCount", static: false, private: false, access: { has: obj => "successCount" in obj, get: obj => obj.successCount, set: (obj, value) => { obj.successCount = value; } }, metadata: _metadata }, _successCount_initializers, _successCount_extraInitializers);
            __esDecorate(null, null, _failedCount_decorators, { kind: "field", name: "failedCount", static: false, private: false, access: { has: obj => "failedCount" in obj, get: obj => obj.failedCount, set: (obj, value) => { obj.failedCount = value; } }, metadata: _metadata }, _failedCount_initializers, _failedCount_extraInitializers);
            __esDecorate(null, null, _successIds_decorators, { kind: "field", name: "successIds", static: false, private: false, access: { has: obj => "successIds" in obj, get: obj => obj.successIds, set: (obj, value) => { obj.successIds = value; } }, metadata: _metadata }, _successIds_initializers, _successIds_extraInitializers);
            __esDecorate(null, null, _failedIds_decorators, { kind: "field", name: "failedIds", static: false, private: false, access: { has: obj => "failedIds" in obj, get: obj => obj.failedIds, set: (obj, value) => { obj.failedIds = value; } }, metadata: _metadata }, _failedIds_initializers, _failedIds_extraInitializers);
            __esDecorate(null, null, _errors_decorators, { kind: "field", name: "errors", static: false, private: false, access: { has: obj => "errors" in obj, get: obj => obj.errors, set: (obj, value) => { obj.errors = value; } }, metadata: _metadata }, _errors_initializers, _errors_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { BatchOperationResponseDto };
/**
 * 项目用户权限列表响应 DTO
 */
let ProjectUserPermissionsDto = (() => {
    var _a;
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _userId_decorators;
    let _userId_initializers = [];
    let _userId_extraInitializers = [];
    let _permissions_decorators;
    let _permissions_initializers = [];
    let _permissions_extraInitializers = [];
    return _a = class ProjectUserPermissionsDto {
            constructor() {
                this.projectId = __runInitializers(this, _projectId_initializers, void 0);
                this.userId = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _userId_initializers, void 0));
                this.permissions = (__runInitializers(this, _userId_extraInitializers), __runInitializers(this, _permissions_initializers, void 0));
                __runInitializers(this, _permissions_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _projectId_decorators = [ApiProperty({ description: "项目 ID" })];
            _userId_decorators = [ApiProperty({ description: "用户 ID" })];
            _permissions_decorators = [ApiProperty({ description: "权限列表", type: () => [String] })];
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _userId_decorators, { kind: "field", name: "userId", static: false, private: false, access: { has: obj => "userId" in obj, get: obj => obj.userId, set: (obj, value) => { obj.userId = value; } }, metadata: _metadata }, _userId_initializers, _userId_extraInitializers);
            __esDecorate(null, null, _permissions_decorators, { kind: "field", name: "permissions", static: false, private: false, access: { has: obj => "permissions" in obj, get: obj => obj.permissions, set: (obj, value) => { obj.permissions = value; } }, metadata: _metadata }, _permissions_initializers, _permissions_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ProjectUserPermissionsDto };
/**
 * 权限检查结果响应 DTO
 */
let PermissionCheckResponseDto = (() => {
    var _a;
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _userId_decorators;
    let _userId_initializers = [];
    let _userId_extraInitializers = [];
    let _permission_decorators;
    let _permission_initializers = [];
    let _permission_extraInitializers = [];
    let _hasPermission_decorators;
    let _hasPermission_initializers = [];
    let _hasPermission_extraInitializers = [];
    return _a = class PermissionCheckResponseDto {
            constructor() {
                this.projectId = __runInitializers(this, _projectId_initializers, void 0);
                this.userId = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _userId_initializers, void 0));
                this.permission = (__runInitializers(this, _userId_extraInitializers), __runInitializers(this, _permission_initializers, void 0));
                this.hasPermission = (__runInitializers(this, _permission_extraInitializers), __runInitializers(this, _hasPermission_initializers, void 0));
                __runInitializers(this, _hasPermission_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _projectId_decorators = [ApiProperty({ description: "项目 ID" })];
            _userId_decorators = [ApiProperty({ description: "用户 ID" })];
            _permission_decorators = [ApiProperty({ description: "检查的权限" })];
            _hasPermission_decorators = [ApiProperty({ description: "是否有权限" })];
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _userId_decorators, { kind: "field", name: "userId", static: false, private: false, access: { has: obj => "userId" in obj, get: obj => obj.userId, set: (obj, value) => { obj.userId = value; } }, metadata: _metadata }, _userId_initializers, _userId_extraInitializers);
            __esDecorate(null, null, _permission_decorators, { kind: "field", name: "permission", static: false, private: false, access: { has: obj => "permission" in obj, get: obj => obj.permission, set: (obj, value) => { obj.permission = value; } }, metadata: _metadata }, _permission_initializers, _permission_extraInitializers);
            __esDecorate(null, null, _hasPermission_decorators, { kind: "field", name: "hasPermission", static: false, private: false, access: { has: obj => "hasPermission" in obj, get: obj => obj.hasPermission, set: (obj, value) => { obj.hasPermission = value; } }, metadata: _metadata }, _hasPermission_initializers, _hasPermission_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PermissionCheckResponseDto };
//# sourceMappingURL=file-system-response.dto.js.map