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

import { ApiProperty } from "@nestjs/swagger";
import { FileStatus, ProjectStatus } from "@prisma/client";

/**
 * 文件系统节点 DTO
 */
export class FileSystemNodeDto {
	@ApiProperty({ description: "节点 ID" })
	id: string;

	@ApiProperty({ description: "节点名称" })
	name: string;

	@ApiProperty({ description: "节点描述", required: false })
	description?: string;

	@ApiProperty({ description: "是否为文件夹" })
	isFolder: boolean;

	@ApiProperty({ description: "是否为根节点" })
	isRoot: boolean;

	@ApiProperty({ description: "父节点 ID", required: false })
	parentId?: string;

	@ApiProperty({ description: "文件路径", required: false })
	path?: string;

	@ApiProperty({ description: "文件大小", required: false })
	size?: number;

	@ApiProperty({ description: "文件 MIME 类型", required: false })
	mimeType?: string;

	@ApiProperty({ description: "文件哈希", required: false })
	fileHash?: string;

	@ApiProperty({
		description: "文件状态",
		enum: Object.values(FileStatus),
		enumName: "FileStatusEnum",
		required: false,
	})
	fileStatus?: FileStatus;

	@ApiProperty({ description: "创建时间" })
	createdAt: Date;

	@ApiProperty({ description: "更新时间" })
	updatedAt: Date;

	@ApiProperty({ description: "删除时间", required: false })
	deletedAt?: Date;

	@ApiProperty({ description: "所有者 ID" })
	ownerId: string;

	@ApiProperty({
		description: "私人空间标识（非空表示为私人空间）",
		required: false,
	})
	personalSpaceKey?: string;

	@ApiProperty({
		description: "公共资源库标识（drawing: 图纸库, block: 图块库）",
		required: false,
	})
	libraryKey?: string;

	@ApiProperty({ description: "子节点数量", required: false })
	childrenCount?: number;

	@ApiProperty({ description: "项目 ID", required: false })
	projectId?: string;
}

/**
 * 项目 DTO
 */
export class ProjectDto {
	@ApiProperty({ description: "项目 ID" })
	id: string;

	@ApiProperty({ description: "项目名称" })
	name: string;

	@ApiProperty({ description: "项目描述", required: false })
	description?: string;

	@ApiProperty({
		description: "项目状态",
		enum: Object.values(ProjectStatus),
		enumName: "ProjectStatusEnum",
	})
	status: ProjectStatus;

	@ApiProperty({ description: "所有者 ID" })
	ownerId: string;

	@ApiProperty({ description: "创建时间" })
	createdAt: Date;

	@ApiProperty({ description: "更新时间" })
	updatedAt: Date;

	@ApiProperty({ description: "删除时间", required: false })
	deletedAt?: Date;

	@ApiProperty({ description: "成员数量", required: false })
	memberCount?: number;
}

/**
 * 项目成员 DTO
 */
export class ProjectMemberDto {
	@ApiProperty({ description: "用户 ID" })
	id: string;

	@ApiProperty({ description: "用户邮箱" })
	email: string;

	@ApiProperty({ description: "用户名" })
	username: string;

	@ApiProperty({ description: "用户昵称", required: false })
	nickname?: string;

	@ApiProperty({ description: "头像 URL", required: false })
	avatar?: string;

	@ApiProperty({ description: "项目角色 ID" })
	projectRoleId: string;

	@ApiProperty({ description: "项目角色名称" })
	projectRoleName: string;

	@ApiProperty({ description: "加入时间" })
	joinedAt: Date;
}

/**
 * 统一分页列表响应 DTO - 所有列表接口都用这个格式
 */
export class NodeListResponseDto {
	@ApiProperty({
		description: "节点列表",
		type: () => FileSystemNodeDto,
		isArray: true,
	})
	nodes: FileSystemNodeDto[];

	@ApiProperty({ description: "总数" })
	total: number;

	@ApiProperty({ description: "当前页码" })
	page: number;

	@ApiProperty({ description: "每页数量" })
	limit: number;

	@ApiProperty({ description: "总页数" })
	totalPages: number;
}

/**
 * 项目列表响应 DTO - 现在它只是 NodeListResponseDto 的别名
 */
export class ProjectListResponseDto extends NodeListResponseDto {}

/**
 * 节点树响应 DTO
 */
export class NodeTreeResponseDto extends FileSystemNodeDto {
	@ApiProperty({
		description: "子节点",
		type: () => [FileSystemNodeDto],
		required: false,
	})
	children?: FileSystemNodeDto[];
}

/**
 * 回收站项目 DTO
 */
export class TrashItemDto {
	@ApiProperty({ description: "节点 ID" })
	id: string;

	@ApiProperty({ description: "节点名称" })
	name: string;

	@ApiProperty({ description: "节点描述", required: false })
	description?: string;

	@ApiProperty({ description: "是否为文件夹" })
	isFolder: boolean;

	@ApiProperty({ description: "原始父节点 ID" })
	originalParentId: string;

	@ApiProperty({ description: "文件大小", required: false })
	size?: number;

	@ApiProperty({ description: "文件 MIME 类型", required: false })
	mimeType?: string;

	@ApiProperty({ description: "创建时间" })
	createdAt: Date;

	@ApiProperty({ description: "更新时间" })
	updatedAt: Date;

	@ApiProperty({ description: "删除时间" })
	deletedAt: Date;

	@ApiProperty({ description: "所有者 ID" })
	ownerId: string;

	@ApiProperty({ description: "项目 ID", required: false })
	projectId?: string;
}

/**
 * 回收站列表响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export class TrashListResponseDto extends NodeListResponseDto {}

/**
 * 项目内回收站响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export class ProjectTrashResponseDto extends NodeListResponseDto {}

/**
 * 操作成功响应 DTO
 */
export class OperationSuccessDto {
	@ApiProperty({ description: "操作结果消息" })
	message: string;

	@ApiProperty({ description: "受影响的节点 ID", required: false })
	nodeId?: string;

	@ApiProperty({ description: "是否成功" })
	success: boolean;
}

/**
 * 批量操作响应 DTO
 */
export class BatchOperationResponseDto {
	@ApiProperty({ description: "成功数量" })
	successCount: number;

	@ApiProperty({ description: "失败数量" })
	failedCount: number;

	@ApiProperty({ description: "成功 ID 列表" })
	successIds: string[];

	@ApiProperty({ description: "失败 ID 列表" })
	failedIds: string[];

	@ApiProperty({ description: "错误信息", required: false })
	errors?: string[];
}

/**
 * 项目用户权限列表响应 DTO
 */
export class ProjectUserPermissionsDto {
	@ApiProperty({ description: "项目 ID" })
	projectId: string;

	@ApiProperty({ description: "用户 ID" })
	userId: string;

	@ApiProperty({ description: "权限列表", type: () => [String] })
	permissions: string[];
}

/**
 * 权限检查结果响应 DTO
 */
export class PermissionCheckResponseDto {
	@ApiProperty({ description: "项目 ID" })
	projectId: string;

	@ApiProperty({ description: "用户 ID" })
	userId: string;

	@ApiProperty({ description: "检查的权限" })
	permission: string;

	@ApiProperty({ description: "是否有权限" })
	hasPermission: boolean;
}
