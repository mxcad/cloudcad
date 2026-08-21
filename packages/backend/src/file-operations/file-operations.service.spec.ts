/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////////

import { NodeType } from "@cloudcad/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { PermissionService } from "../permission/services/permission.service";
import { StorageManager } from "../storage-management/services/storage-manager.service";
import { DatabaseService } from "../database/database.service";

import { StorageInfoService } from "../file-system/storage-quota/storage-info.service";
import { ProjectPermissionService } from "../roles/project-permission.service";
import { IPROJECT_PERMISSION_SERVICE } from "../roles/interfaces/project-permission-service.interface";
import { IPERMISSION_SERVICE } from "../permission/interfaces/permission-service.interface";
import { IStorageProvider } from "../storage/interfaces/storage-provider.interface";
import { VERSION_CONTROL_TOKEN } from "../version-control/interfaces/version-control.interface";
import { TreeWalker } from "../file-system/file-tree/tree-walker.service";
import { NodeTrashService } from "./node-trash.service";
import { NodeNameService } from "./node-name.service";
import { NodeMutationGuard } from "./node-mutation.guard";
import { NodeStatusTransitioner } from "../file-system/file-status/node-status-transitioner";
import { StorageUsageService } from "../vip/storage-usage/storage-usage.service";
import { NodeSizeResolverService } from "../file-system/storage-quota/node-size-resolver.service";
import { RestrictionEngine } from "../vip/restriction-engine.service";
import { QuotaExceededException } from "../vip/errors/quota-exceeded.error";
import { AuditLogService } from "../audit/audit-log.service";

describe("NodeTrashService", () => {
	let service: NodeTrashService;
	let prisma: any;
	let storageManager: Record<string, jest.Mock>;
	let configService: Record<string, jest.Mock>;
	let versionControlService: Record<string, jest.Mock>;
	let storageInfoService: Record<string, jest.Mock>;
	let treeWalker: Record<string, jest.Mock>;
	let mockRestrictionEngine: Record<string, jest.Mock>;
	let mockNodeMutationGuard: Record<string, jest.Mock>;
	let projectPermissionService: Record<string, jest.Mock>;
	let mockAuditLogService: { log: jest.Mock; logProjectNodeAction: jest.Mock };

	beforeEach(async () => {
		const mockPrisma = {
			fileSystemNode: {
				findFirst: jest.fn(),
				findUnique: jest.fn(),
				findMany: jest.fn(),
				count: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
				deleteMany: jest.fn(),
				updateMany: jest.fn(),
			},
			$transaction: jest.fn(async (fn: Function) =>
				fn({
					fileSystemNode: {
						update: jest.fn().mockResolvedValue({}),
						updateMany: jest.fn().mockResolvedValue({ count: 0 }),
						delete: jest.fn().mockResolvedValue({}),
						deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
						findMany: jest.fn().mockResolvedValue([]),
						findUnique: jest.fn(),
					},
				}),
			),
		};

		const mockStorageManager = {
			getFullPath: jest.fn(),
			getNodeDirectoryRelativePath: jest.fn(),
			copyNodeDirectory: jest.fn(),
		};

		const mockConfigService = {
			get: jest.fn().mockReturnValue("/path/to/files"),
		};

		const mockVersionControlService = {
			isReady: jest.fn().mockReturnValue(false),
			deleteNodeDirectory: jest.fn(),
			commitWorkingCopy: jest.fn(),
		};

		const mockStorageInfoService = {
			invalidateQuotaCache: jest.fn(),
		};

		const mockStorageProvider = {
			checkStorageQuota: jest.fn(),
		};

		const mockProjectPermissionService = {
			checkProjectPermission: jest.fn(),
			isProjectOwner: jest.fn().mockResolvedValue(true),
			checkPermission: jest.fn().mockResolvedValue(true),
		};

		const mockPermissionService = {
			checkPermission: jest.fn(),
		};

		const mockTreeWalker = {
			getSubtreeIds: jest.fn().mockResolvedValue([]),
			getSubtreeFiles: jest.fn().mockResolvedValue([]),
			resolveProjectId: jest.fn().mockResolvedValue(null),
		};

		const mockNodeNameService = {
			generateUniqueName: jest.fn().mockResolvedValue("unique-name"),
		};

		mockRestrictionEngine = {
			buildContext: jest.fn().mockResolvedValue({}),
			evaluate: jest.fn().mockResolvedValue(undefined),
			checkQuota: jest.fn().mockResolvedValue(undefined),
		};

		mockNodeMutationGuard = {
			assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
			assertProjectQuota: jest.fn().mockResolvedValue(undefined),
			assertByteQuota: jest.fn().mockResolvedValue(undefined),
			invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
			resolveProjectContext: jest.fn(),
		};

		mockAuditLogService = {
			log: jest.fn().mockResolvedValue(undefined),
			logProjectNodeAction: jest.fn().mockResolvedValue(undefined),
		};

		const mockNodeSizeResolver = {
			resolveFileSize: jest.fn().mockResolvedValue(1024),
			resolveFileSizes: jest.fn().mockResolvedValue(0),
		};

		const mockNodeStatusTransitioner = {
			transition: jest.fn().mockResolvedValue(undefined),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				NodeTrashService,
				{
					provide: DatabaseService,
					useValue: mockPrisma,
				},
				{
					provide: StorageManager,
					useValue: mockStorageManager,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
				{
					provide: VERSION_CONTROL_TOKEN,
					useValue: mockVersionControlService,
				},
				{
					provide: StorageInfoService,
					useValue: mockStorageInfoService,
				},

				{
					provide: TreeWalker,
					useValue: mockTreeWalker,
				},
				{
					provide: IStorageProvider,
					useValue: mockStorageProvider,
				},
				{
					provide: ProjectPermissionService,
					useValue: mockProjectPermissionService,
				},
				{
					provide: IPROJECT_PERMISSION_SERVICE,
					useValue: mockProjectPermissionService,
				},
				{
					provide: IPERMISSION_SERVICE,
					useValue: mockPermissionService,
				},
				{
					provide: PermissionService,
					useValue: mockPermissionService,
				},
				{
					provide: NodeNameService,
					useValue: mockNodeNameService,
				},
				{
					provide: RestrictionEngine,
					useValue: mockRestrictionEngine,
				},
				{
					provide: NodeMutationGuard,
					useValue: mockNodeMutationGuard,
				},
				{
					provide: NodeStatusTransitioner,
					useValue: mockNodeStatusTransitioner,
				},
				{
					provide: NodeSizeResolverService,
					useValue: mockNodeSizeResolver,
				},
				{
					provide: StorageUsageService,
					useValue: {
						getSubtreeFileNodes: jest.fn().mockResolvedValue([]),
						usageSize: jest.fn().mockResolvedValue(0),
					},
				},
				{
					provide: AuditLogService,
					useValue: mockAuditLogService,
				},
			],
		})
			.setLogger({
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				verbose: jest.fn(),
			})
			.compile();

		service = module.get<NodeTrashService>(NodeTrashService);
		prisma = module.get(DatabaseService);
		storageManager = module.get(StorageManager);
		configService = module.get(ConfigService);
		versionControlService = module.get(VERSION_CONTROL_TOKEN);
		storageInfoService = module.get(StorageInfoService);
		treeWalker = module.get(TreeWalker);
		projectPermissionService = module.get(IPROJECT_PERMISSION_SERVICE);
	});

	describe("deleteNode", () => {
		const softDeletedNode = {
			nodeType: NodeType.FILE,
			path: "/files/test.dwg",
			fileHash: "abc123",
			deletedAt: null,
			ownerId: "user-1",
			projectId: "proj-1",
			size: 1024,
		};

		it("should soft delete a file node", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
			prisma.fileSystemNode.update.mockResolvedValue({
				id: "node-1",
				...softDeletedNode,
				deletedAt: new Date(),
				fileStatus: "DELETED",
			});
			const result = await service.deleteNode("node-1", false);
			expect(result.message).toContain("回收站");
			expect(prisma.$transaction).toHaveBeenCalled();
		});

		it("should soft delete a project node", async () => {
			const projectNode = { ...softDeletedNode, nodeType: NodeType.PROJECT };
			prisma.fileSystemNode.findUnique.mockResolvedValue(projectNode);
			prisma.fileSystemNode.update.mockResolvedValue({
				id: "proj-1",
				...projectNode,
				deletedAt: new Date(),
				projectStatus: "DELETED",
			});
			const result = await service.deleteNode("proj-1", false);
			expect(result.message).toContain("回收站");
		});

		it("should permanently delete a file node", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
			prisma.fileSystemNode.findMany.mockResolvedValue([]);
			prisma.$transaction.mockImplementation(async (fn: Function) => {
				const tx = {
					fileSystemNode: {
						update: jest.fn().mockResolvedValue({}),
						updateMany: jest.fn().mockResolvedValue({ count: 0 }),
						delete: jest.fn().mockResolvedValue({}),
						deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
					},
				};
				return fn(tx);
			});
			const result = await service.deleteNode("node-1", true);
			expect(result.message).toContain("彻底删除");
		});

		it("should throw when node does not exist", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(service.deleteNode("nonexistent", false)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should invalidate quota cache after soft delete", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
			prisma.fileSystemNode.update.mockResolvedValue({});
			await service.deleteNode("node-1", false);
			expect(mockNodeMutationGuard.invalidateQuotaAfterMutation).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ projectId: "proj-1" }),
			);
		});

		it("should invalidate quota cache after permanent delete", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
			prisma.fileSystemNode.findMany.mockResolvedValue([]);
			prisma.$transaction.mockImplementation(async (fn: Function) => {
				const tx = {
					fileSystemNode: {
						update: jest.fn().mockResolvedValue({}),
						updateMany: jest.fn().mockResolvedValue({ count: 0 }),
						delete: jest.fn().mockResolvedValue({}),
						deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
					},
				};
				return fn(tx);
			});
			await service.deleteNode("node-1", true);
			expect(mockNodeMutationGuard.invalidateQuotaAfterMutation).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ projectId: "proj-1" }),
			);
		});
	});

	describe("deleteProject", () => {
		it("should delete a project", async () => {
			prisma.fileSystemNode.findFirst.mockResolvedValue({
				id: "proj-1",
				nodeType: NodeType.PROJECT,
				ownerId: "user-1",
			});
			const pNode = { nodeType: NodeType.PROJECT, deletedAt: null, ownerId: "user-1", projectId: "proj-1", size: 0 };
			prisma.fileSystemNode.findUnique.mockResolvedValue(pNode);
			const result = await service.deleteProject("proj-1", false, "user-1");
			expect(result.message).toContain("回收站");
		});

		it("should throw when project does not exist", async () => {
			prisma.fileSystemNode.findFirst.mockResolvedValue(null);
			await expect(service.deleteProject("nonexistent", false, "user-1")).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw when attempting to delete personal space", async () => {
			prisma.fileSystemNode.findFirst.mockResolvedValue({
				id: "ps-1",
				nodeType: NodeType.PERSONAL_SPACE,
				ownerId: "user-1",
			});
			await expect(service.deleteProject("ps-1", false, "user-1")).rejects.toThrow(
				BadRequestException,
			);
		});
	});

	describe("restoreNode", () => {
		const deletedNode = {
			nodeType: NodeType.FILE,
			deletedAt: new Date(),
			deletedByCascade: false,
			parentId: "parent-1",
			ownerId: "user-1",
			projectId: "proj-1",
			name: "file.dwg",
			fileStatus: "DELETED",
		};

		it("should restore a soft deleted file", async () => {
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce(deletedNode)
				.mockResolvedValueOnce({ deletedAt: null }); // parent exists
			prisma.fileSystemNode.update.mockResolvedValue({
				id: "node-1",
				...deletedNode,
				deletedAt: null,
				fileStatus: "COMPLETED",
			});
			const result = await service.restoreNode("node-1", "user-1");
			expect(result.deletedAt).toBeNull();
			// 恢复审计（NODE_RESTORE）
			expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
				"NODE_RESTORE",
				"node-1",
				"user-1",
				{ restoredName: "file.dwg" },
				"FILE"
			);
		});

		it("should restore a soft deleted project", async () => {
			const deletedProject = { ...deletedNode, nodeType: NodeType.PROJECT, parentId: null, fileStatus: undefined };
			prisma.fileSystemNode.findUnique.mockResolvedValueOnce(deletedProject);
			prisma.fileSystemNode.update.mockResolvedValue({
				id: "proj-1",
				...deletedProject,
				deletedAt: null,
				projectStatus: "ACTIVE",
			});
			const result = await service.restoreNode("proj-1", "user-1");
			expect(result.deletedAt).toBeNull();
		});

		it("should throw when node does not exist", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(
				service.restoreNode("nonexistent", "user-1"),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw when node is not deleted", async () => {
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				...deletedNode,
				deletedAt: null,
			});
			await expect(service.restoreNode("node-1", "user-1")).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw when parent node is deleted", async () => {
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce(deletedNode)
				.mockResolvedValueOnce({ deletedAt: new Date() });
			await expect(service.restoreNode("node-1", "user-1")).rejects.toThrow(
				/父节点已被删除/,
			);
		});

		it("should throw when parent node does not exist", async () => {
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce(deletedNode)
				.mockResolvedValueOnce(null);
			await expect(service.restoreNode("node-1", "user-1")).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should invalidate quota cache after restore", async () => {
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce(deletedNode)
				.mockResolvedValueOnce({ deletedAt: null });
			prisma.fileSystemNode.update.mockResolvedValue({});
			await service.restoreNode("node-1", "user-1");
			expect(mockNodeMutationGuard.invalidateQuotaAfterMutation).toHaveBeenCalledWith(
				"user-1",
				expect.objectContaining({ projectId: "proj-1" }),
			);
		});
	});

	describe("restoreProject", () => {
		it("should restore a deleted project", async () => {
			prisma.fileSystemNode.findFirst
				.mockResolvedValueOnce({
					id: "proj-1",
					nodeType: NodeType.PROJECT,
					deletedAt: new Date(),
					projectStatus: "DELETED",
					name: "proj-1",
					ownerId: "user-1",
				})
				.mockResolvedValue(null); // no name conflict
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "proj-1", nodeType: NodeType.PROJECT, deletedAt: new Date(),
				deletedByCascade: false, parentId: null, ownerId: "user-1",
				projectId: "proj-1", name: "proj-1",
			});
			prisma.fileSystemNode.update.mockResolvedValue({
				id: "proj-1",
				deletedAt: null,
				projectStatus: "ACTIVE",
			});
			const result = await service.restoreProject("proj-1");
			expect(result.message).toContain("恢复");
		});

		it("should throw when project not in trash", async () => {
			prisma.fileSystemNode.findFirst.mockResolvedValue(null);
			await expect(service.restoreProject("proj-1")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe("clearProjectTrash", () => {
		it("should clear all deleted nodes in project", async () => {
			treeWalker.getSubtreeIds.mockResolvedValue(["d1", "d2"]);
			prisma.fileSystemNode.findUnique.mockResolvedValue({ id: "proj-1" });
			const trashItem = { id: "d1", nodeType: NodeType.FILE, projectId: "proj-1", ownerId: "user-1", deletedAt: new Date() };
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([{ id: "d1" }, { id: "d2" }])
				.mockResolvedValueOnce([trashItem, { ...trashItem, id: "d2" }])
				.mockResolvedValueOnce([{ id: "d1", nodeType: NodeType.FILE }, { id: "d2", nodeType: NodeType.FILE }])
				.mockResolvedValue([]);
			prisma.$transaction.mockImplementation(async (fn: Function) => {
				const tx = {
					fileSystemNode: {
						updateMany: jest.fn().mockResolvedValue({ count: 0 }),
						delete: jest.fn().mockResolvedValue({}),
						deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
					},
				};
				return fn(tx);
			});
			const result = await service.clearProjectTrash("proj-1", "user-1");
			expect(result.message).toContain("删除");
		});

		it("should invalidate quota cache after clearing", async () => {
			treeWalker.getSubtreeIds.mockResolvedValue(["d1"]);
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "d1", nodeType: NodeType.FILE, path: null, fileHash: null, ownerId: "user-1",
			});
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([{ id: "d1" }])
				.mockResolvedValueOnce([{ id: "d1", nodeType: NodeType.FILE, projectId: "proj-1", ownerId: "user-1", deletedAt: new Date() }])
				.mockResolvedValueOnce([{ id: "d1", nodeType: NodeType.FILE }])
				.mockResolvedValue([]);
			prisma.$transaction.mockImplementation(async (fn: Function) => {
				const tx = {
					fileSystemNode: {
						updateMany: jest.fn().mockResolvedValue({ count: 0 }),
						delete: jest.fn().mockResolvedValue({}),
						deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
					},
				};
				return fn(tx);
			});
			await service.clearProjectTrash("proj-1", "user-1");
			expect(mockNodeMutationGuard.invalidateQuotaAfterMutation).toHaveBeenCalled();
		});
	});



	describe("softDeleteDescendants", () => {
		it("should soft delete all child nodes via transaction", async () => {
			const tx = {
				fileSystemNode: {
					findMany: jest.fn()
						.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }])
						.mockResolvedValue([]),
					update: jest.fn().mockResolvedValue({}),
					updateMany: jest.fn().mockResolvedValue({ count: 2 }),
				},
			};
			prisma.fileSystemNode.findMany.mockResolvedValue([]);
			await service.softDeleteDescendants(tx as any, "parent");
			expect(tx.fileSystemNode.update).toHaveBeenCalledTimes(2);
		});

		it("should do nothing when no children exist", async () => {
			const tx = {
				fileSystemNode: { findMany: jest.fn().mockResolvedValue([]) },
			};
			await service.softDeleteDescendants(tx as any, "empty-parent");
		});
	});

	describe("deleteDescendantsWithFiles", () => {
		it("should delete all child nodes and their files via transaction", async () => {
			const tx = {
				fileSystemNode: {
					findMany: jest
						.fn()
						.mockResolvedValueOnce([
							{ id: "c1", path: "/f/a.dwg", fileHash: "h1" },
						])
						.mockResolvedValue([]),
					deleteMany: jest.fn(),
				},
			};
			await service.deleteDescendantsWithFiles(tx as any, "parent");
			expect(tx.fileSystemNode.deleteMany).toHaveBeenCalled();
		});

		it("should do nothing when no children exist", async () => {
			const tx = {
				fileSystemNode: {
					findMany: jest.fn().mockResolvedValue([]),
					deleteMany: jest.fn(),
				},
			};
			await service.deleteDescendantsWithFiles(tx as any, "empty");
			expect(tx.fileSystemNode.deleteMany).not.toHaveBeenCalled();
		});
	});

	describe("restoreTrashItems", () => {
		it("should restore multiple deleted items", async () => {
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, deletedAt: new Date(), ownerId: "user-1", projectId: "p1" },
					{ id: "n1", nodeType: NodeType.FILE, parentId: "p1", deletedAt: new Date(), ownerId: "user-1", projectId: "p1" },
				])
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT },
					{ id: "n1", nodeType: NodeType.FILE, parentId: "p1" },
				])
				.mockResolvedValue([]);
			prisma.fileSystemNode.findFirst
				.mockResolvedValueOnce({
					id: "p1",
					deletedAt: new Date(),
					name: "p1",
					ownerId: "user-1",
				})
				.mockResolvedValue(null); // no name conflict
			const sharedNode = { nodeType: NodeType.PROJECT, deletedAt: new Date(), fileStatus: "DELETED", parentId: null, ownerId: "user-1", projectId: "p1", name: "p1" };
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce(sharedNode)                    // #1: restoreProject → restoreNode(p1)
				.mockResolvedValueOnce({ id: "n1", nodeType: NodeType.FILE, deletedAt: new Date(), fileStatus: "DELETED", parentId: "p1", ownerId: "user-1", projectId: "p1", name: "n1.dwg" })  // #2: restoreNode(n1) node lookup
				.mockResolvedValueOnce({ deletedAt: null, nodeType: NodeType.PROJECT, projectId: "p1" })  // #3: restoreNode(n1) parent check
				.mockResolvedValue(null);
			const r = await service.restoreTrashItems(["p1", "n1"], "user-1");
			expect(r.message).toContain("恢复");
			expect(mockNodeMutationGuard.assertProjectQuota).toHaveBeenCalledWith(
				"user-1",
				1,
			);
		});

		it("should trigger VIP quota check before permission validation", async () => {
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, deletedAt: new Date(), ownerId: "user-1", projectId: "p1" },
				])
				.mockResolvedValue([]);
			projectPermissionService.isProjectOwner.mockResolvedValueOnce(false);
			projectPermissionService.checkPermission.mockResolvedValueOnce(false);
			mockNodeMutationGuard.assertProjectQuota.mockRejectedValueOnce(
				new QuotaExceededException("已超出项目数量上限", {
					restrictionKey: "quota.max_projects",
					current: 3,
					limit: 3,
				}),
			);
			await expect(service.restoreTrashItems(["p1"], "user-1")).rejects.toThrow(QuotaExceededException);
			expect(projectPermissionService.isProjectOwner).not.toHaveBeenCalled();
		});

		it("should treat direct ownerId match as owner even when isProjectOwner cache is stale", async () => {
			const projectItem = { id: "p1", nodeType: NodeType.PROJECT, deletedAt: new Date(), ownerId: "user-1", projectId: "p1" };
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([projectItem])
				.mockResolvedValueOnce([projectItem])
				.mockResolvedValue([]);
			prisma.fileSystemNode.findFirst
				.mockResolvedValueOnce({ id: "p1", deletedAt: new Date(), name: "p1", ownerId: "user-1" })
				.mockResolvedValue(null);
			prisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({ id: "p1", nodeType: NodeType.PROJECT, deletedAt: new Date(), fileStatus: "DELETED", parentId: null, ownerId: "user-1", projectId: "p1", name: "p1" })
				.mockResolvedValue(null);
			projectPermissionService.isProjectOwner.mockResolvedValue(false);
			projectPermissionService.checkPermission.mockResolvedValue(false);
			const r = await service.restoreTrashItems(["p1"], "user-1");
			expect(r.message).toContain("恢复");
			expect(projectPermissionService.isProjectOwner).not.toHaveBeenCalled();
			expect(projectPermissionService.checkPermission).not.toHaveBeenCalled();
		});

		it("should return message when itemIds is empty", async () => {
			const r = await service.restoreTrashItems([], "user-1");
			expect(r.message).toContain("选择");
		});

		it("should throw when no deleted items found", async () => {
			prisma.fileSystemNode.findMany.mockResolvedValue([]);
			await expect(
				service.restoreTrashItems(["bad"], "user-1"),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe("permanentlyDeleteTrashItems", () => {
		it("should permanently delete multiple items", async () => {
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, deletedAt: new Date(), ownerId: "user-1" },
					{ id: "n1", nodeType: NodeType.FILE, deletedAt: new Date(), parentId: "p1", projectId: "p1", ownerId: "user-1" },
				])
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT },
					{ id: "n1", nodeType: NodeType.FILE },
				])
				.mockResolvedValue([]);
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				deletedAt: new Date(),
				nodeType: NodeType.PROJECT,
				ownerId: "user-1",
			});
			prisma.$transaction.mockImplementation(async (fn: Function) =>
				fn({
					fileSystemNode: {
						update: jest.fn(),
						updateMany: jest.fn(),
						delete: jest.fn(),
						deleteMany: jest.fn(),
					},
				}),
			);
			const r = await service.permanentlyDeleteTrashItems(["p1", "n1"], "test-user");
			expect(r.message).toContain("删除");
		});

		it("should return message when itemIds is empty", async () => {
			const r = await service.permanentlyDeleteTrashItems([], "test-user");
			expect(r.message).toContain("选择");
		});

		it("should throw when no deleted items found", async () => {
			prisma.fileSystemNode.findMany.mockResolvedValue([]);
			await expect(
				service.permanentlyDeleteTrashItems(["bad"], "test-user"),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe("clearTrash", () => {
		it("should clear all deleted projects and nodes for user", async () => {
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, ownerId: "user-1", projectId: "p1" },
				])
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, ownerId: "user-1", projectId: "p1", deletedAt: new Date() },
				])
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT },
				])
				.mockResolvedValue([]);
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				nodeType: NodeType.PROJECT,
				ownerId: "user-1",
				path: null,
				fileHash: null,
				name: "p1",
			});
			prisma.$transaction.mockImplementation(async (fn: Function) =>
				fn({
					fileSystemNode: {
						update: jest.fn(),
						updateMany: jest.fn(),
						delete: jest.fn(),
						deleteMany: jest.fn(),
					},
				}),
			);
			const r = await service.clearTrash("user-1");
			expect(r.message).toContain("删除");
		});

		it("should invalidate quota cache after clearing", async () => {
			prisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "p1", nodeType: NodeType.PROJECT, ownerId: "user-1", projectId: "p1" },
				])
				.mockResolvedValue([
					{ id: "p1", nodeType: NodeType.PROJECT, ownerId: "user-1", projectId: "p1", deletedAt: new Date() },
				]);
			prisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				nodeType: NodeType.PROJECT,
				ownerId: "user-1",
				path: null,
				fileHash: null,
				name: "p1",
			});
			prisma.$transaction.mockImplementation(async (fn: Function) =>
				fn({
					fileSystemNode: {
						update: jest.fn(),
						updateMany: jest.fn(),
						delete: jest.fn(),
						deleteMany: jest.fn(),
					},
				}),
			);
			await service.clearTrash("user-1");
			expect(mockNodeMutationGuard.invalidateQuotaAfterMutation).toHaveBeenCalled();
		});
	});
});
