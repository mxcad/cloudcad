///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { StorageManager } from "../../common/services/storage-manager.service";
import { DatabaseService } from "../../database/database.service";
import { StorageService } from "../../storage/storage.service";
import { StorageInfoService } from "../storage-quota/storage-info.service";
import { FileTreeService } from "./file-tree.service";

describe("FileTreeService", () => {
	let service: FileTreeService;

	// Prisma mock helpers
	const mockPrisma = {
		fileSystemNode: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			findFirst: jest.fn(),
			count: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
		$transaction: jest.fn(),
	};

	const mockStorageManager = {
		allocateNodeStorage: jest.fn(),
		getFullPath: jest.fn(),
	};

	const mockStorageInfoService = {
		invalidateQuotaCache: jest.fn(),
	};

	const mockStorageService = {
		copyFromFs: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FileTreeService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: StorageManager, useValue: mockStorageManager },
				{ provide: StorageInfoService, useValue: mockStorageInfoService },
				{ provide: StorageService, useValue: mockStorageService },
			],
		}).compile();

		service = module.get<FileTreeService>(FileTreeService);
	});

	// ==================== createFileNode ====================
	describe("createFileNode", () => {
		const defaultOptions = {
			name: "test.dwg",
			fileHash: "abc123",
			size: 1024,
			mimeType: "application/dwg",
			extension: ".dwg",
			parentId: "parent-1",
			ownerId: "user-1",
			skipFileCopy: true,
		};

		it("should create a file node successfully", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				isFolder: true,
				isRoot: false,
				projectId: "proj-1",
			});
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
				const tx = {
					fileSystemNode: {
						findMany: mockPrisma.fileSystemNode.findMany,
						findUnique: mockPrisma.fileSystemNode.findUnique,
						create: mockPrisma.fileSystemNode.create,
						update: mockPrisma.fileSystemNode.update,
					},
				};
				return cb(tx);
			});
			mockPrisma.fileSystemNode.create.mockResolvedValue({
				id: "node-1",
				name: "test.dwg",
				isFolder: false,
			});
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({
					id: "parent-1",
					isFolder: true,
					isRoot: false,
					projectId: "proj-1",
				}) // parent check
				.mockResolvedValueOnce({ id: "node-1", name: "test.dwg" }); // return from transaction

			const result = await service.createFileNode(defaultOptions);
			expect(result).toBeDefined();
			expect(mockPrisma.$transaction).toHaveBeenCalled();
			expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
		});

		it("should throw NotFoundException when parent not found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(service.createFileNode(defaultOptions)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw BadRequestException when parent is not a folder", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				isFolder: false,
			});
			await expect(service.createFileNode(defaultOptions)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should generate unique name when file name conflicts", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				isFolder: true,
				isRoot: false,
				projectId: "proj-1",
			});
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([
				{ name: "test.dwg" },
				{ name: "test (1).dwg" },
			]);
			mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
				const tx = {
					fileSystemNode: {
						findMany: mockPrisma.fileSystemNode.findMany,
						findUnique: mockPrisma.fileSystemNode.findUnique,
						create: jest
							.fn()
							.mockResolvedValue({ id: "node-2", name: "test (2).dwg" }),
						update: jest.fn(),
					},
				};
				return cb(tx);
			});
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({
					id: "parent-1",
					isFolder: true,
					isRoot: false,
					projectId: "proj-1",
				})
				.mockResolvedValueOnce({ id: "node-2", name: "test (2).dwg" });

			const result = await service.createFileNode(defaultOptions);
			expect(result).toBeDefined();
		});
	});

	// ==================== getNode ====================
	describe("getNode", () => {
		it("should return node when found", async () => {
			const node = { id: "n1", name: "test.dwg", deletedAt: null };
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
			expect(await service.getNode("n1")).toEqual(node);
		});

		it("should throw NotFoundException when not found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(service.getNode("missing")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// ==================== getNodeWithLibraryKey ====================
	describe("getNodeWithLibraryKey", () => {
		it("should return node with library key", async () => {
			const node = { id: "n1", libraryKey: "drawing", personalSpaceKey: null };
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
			const result = await service.getNodeWithLibraryKey("n1");
			expect(result.libraryKey).toBe("drawing");
		});

		it("should throw when not found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(service.getNodeWithLibraryKey("missing")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// ==================== isLibraryNode ====================
	describe("isLibraryNode", () => {
		it("should return false for non-library nodes", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "n1",
				projectId: "p1",
				isRoot: false,
				libraryKey: null,
			});
			// Root lookup returns null libraryKey
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				libraryKey: null,
			});
			expect(await service.isLibraryNode("n1")).toBe(false);
		});

		it("should return true for library drawing nodes", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
				libraryKey: "drawing",
				projectId: null,
			});
			expect(await service.isLibraryNode("root-1")).toBe(true);
		});
	});

	// ==================== getNodeTree ====================
	describe("getNodeTree", () => {
		it("should return node tree with children", async () => {
			const node = {
				id: "n1",
				name: "root",
				isRoot: true,
				projectId: "n1",
				children: [{ id: "c1", name: "child" }],
			};
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
			const result = await service.getNodeTree("n1");
			expect(result).toBeDefined();
			expect(result.id).toBe("n1");
		});

		it("should throw when not found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
			await expect(service.getNodeTree("missing")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// ==================== getChildren ====================
	describe("getChildren", () => {
		it("should return paginated children", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				deletedAt: null,
			});
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([
				{ id: "c1", name: "file.dwg", _count: { children: 0 } },
			]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(1);

			const result = await service.getChildren("parent-1");
			expect(result.nodes).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.page).toBe(1);
			expect(result.limit).toBe(50);
		});

		it("should return empty when parent is deleted", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				deletedAt: new Date(),
			});
			const result = await service.getChildren("parent-1");
			expect(result.nodes).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("should apply search filter", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				deletedAt: null,
			});
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.getChildren("p1", undefined, { search: "test" });
			const findManyCall = mockPrisma.fileSystemNode.findMany.mock.calls[0][0];
			expect(findManyCall.where.OR).toBeDefined();
		});

		it("should filter by nodeType", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "p1",
				deletedAt: null,
			});
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.getChildren("p1", undefined, { nodeType: "folder" });
			expect(
				mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where.isFolder,
			).toBe(true);
		});
	});

	// ==================== updateNodePath ====================
	describe("updateNodePath", () => {
		it("should update node path", async () => {
			mockPrisma.fileSystemNode.update.mockResolvedValue({
				id: "n1",
				path: "/new/path",
			});
			const result = await service.updateNodePath("n1", "/new/path");
			expect(result.path).toBe("/new/path");
		});
	});

	// ==================== getRootNode ====================
	describe("getRootNode", () => {
		it("should return current node if root", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
			});
			const result = await service.getRootNode("root-1");
			expect(result.id).toBe("root-1");
		});

		it("should return project root for nested node", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "child-1",
				isRoot: false,
				projectId: null,
				parentId: "parent-1",
			});
			// getProjectId recursion: follow parents
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({
					id: "child-1",
					isRoot: false,
					projectId: null,
					parentId: "parent-1",
				})
				.mockResolvedValueOnce({
					id: "parent-1",
					isRoot: false,
					projectId: "root-1",
					parentId: null,
				})
				.mockResolvedValueOnce({
					id: "root-1",
					isRoot: true,
					projectId: null,
					parentId: null,
				});

			const result = await service.getRootNode("child-1");
			expect(result.id).toBe("root-1");
		});

		it("should throw NotFoundException when no root found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "orphan",
				isRoot: false,
				projectId: null,
				parentId: null,
			});
			await expect(service.getRootNode("orphan")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// ==================== getProjectId ====================
	describe("getProjectId", () => {
		it("should return nodeId for root node", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
			});
			expect(await service.getProjectId("root-1")).toBe("root-1");
		});

		it("should return projectId for child node with projectId", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "child-1",
				isRoot: false,
				projectId: "proj-1",
				parentId: "parent-1",
			});
			expect(await service.getProjectId("child-1")).toBe("proj-1");
		});

		it("should traverse up parents to find root", async () => {
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({
					id: "child-1",
					isRoot: false,
					projectId: null,
					parentId: "parent-1",
				})
				.mockResolvedValueOnce({
					id: "parent-1",
					isRoot: false,
					projectId: null,
					parentId: "root-1",
				})
				.mockResolvedValueOnce({
					id: "root-1",
					isRoot: true,
					projectId: null,
					parentId: null,
				});
			expect(await service.getProjectId("child-1")).toBe("root-1");
		});

		it("should return null when node not found", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
			expect(await service.getProjectId("missing")).toBeNull();
		});
	});

	// ==================== getLibraryKey ====================
	describe("getLibraryKey", () => {
		it("should return libraryKey for root library node", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "lib-1",
				isRoot: true,
				libraryKey: "drawing",
			});
			expect(await service.getLibraryKey("lib-1")).toBe("drawing");
		});

		it("should return null for non-library node", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "n1",
				isRoot: false,
				projectId: null,
				libraryKey: null,
			});
			expect(await service.getLibraryKey("n1")).toBeNull();
		});

		it("should resolve libraryKey from root for nested nodes", async () => {
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({
					id: "child-1",
					isRoot: false,
					projectId: "lib-1",
					libraryKey: null,
				})
				.mockResolvedValueOnce({ id: "lib-1", libraryKey: "drawing" });
			expect(await service.getLibraryKey("child-1")).toBe("drawing");
		});
	});

	// ==================== getTrashItems ====================
	describe("getTrashItems", () => {
		it("should return trash items for user", async () => {
			mockPrisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "proj-1", name: "Deleted Project", itemType: "project" },
				])
				.mockResolvedValueOnce([
					{ id: "node-1", name: "deleted.dwg", _count: { children: 0 } },
				]);
			const result = await service.getTrashItems("user-1");
			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
		});
	});

	// ==================== getAllFilesUnderNode ====================
	describe("getAllFilesUnderNode", () => {
		it("should recursively collect all files", async () => {
			// First call: check parent node exists
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				deletedAt: null,
			});
			// Collect file IDs: one folder with one file
			mockPrisma.fileSystemNode.findMany
				.mockResolvedValueOnce([
					{ id: "folder-1", isFolder: true },
					{ id: "file-1", isFolder: false },
				])
				.mockResolvedValueOnce([]); // folder-1 has no children

			mockPrisma.fileSystemNode.findMany.mockResolvedValueOnce([
				{ id: "file-1", name: "test.dwg" },
			]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(1);

			const result = await service.getAllFilesUnderNode("parent-1");
			expect(result.nodes).toHaveLength(1);
		});

		it("should return empty when parent deleted", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				deletedAt: new Date(),
			});
			const result = await service.getAllFilesUnderNode("parent-1");
			expect(result.nodes).toEqual([]);
		});
	});
});
