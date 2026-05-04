///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
	ProjectPermission,
	SystemPermission,
} from "../../common/enums/permissions.enum";
import { PermissionService } from "../../common/services/permission.service";
import { DatabaseService } from "../../database/database.service";
import { SearchScope, SearchType } from "../dto/search.dto";
import { FileSystemPermissionService } from "../file-permission/file-system-permission.service";
import { SearchService } from "./search.service";

describe("SearchService", () => {
	let service: SearchService;

	const mockPrisma = {
		fileSystemNode: {
			findMany: jest.fn(),
			count: jest.fn(),
		},
		$queryRaw: jest.fn(),
	};

	const mockPermissionService = {
		checkNodePermission: jest.fn(),
	};

	const mockSystemPermissionService = {
		checkSystemPermission: jest.fn(),
		checkSystemPermissionWithContext: jest.fn(),
		checkSystemPermissionsBatch: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		// Set default mock implementations (resetMocks: true in jest.config clears them between tests)
		mockPrisma.$queryRaw.mockResolvedValue([{ id: "proj-1" }, { id: "f1" }, { id: "f2" }]);
		mockPermissionService.checkNodePermission.mockResolvedValue(true);
		mockSystemPermissionService.checkSystemPermission.mockResolvedValue(true);
		mockSystemPermissionService.checkSystemPermissionsBatch.mockResolvedValue([true]);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SearchService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{
					provide: FileSystemPermissionService,
					useValue: mockPermissionService,
				},
				{ provide: PermissionService, useValue: mockSystemPermissionService },
			],
		}).compile();

		service = module.get<SearchService>(SearchService);
	});

	// Helper: minimal node shape returned by Prisma
	function makeNode(overrides: any = {}) {
		return {
			id: "n1",
			name: "file.dwg",
			description: null,
			isFolder: false,
			isRoot: false,
			parentId: "p1",
			path: null,
			size: 1024,
			mimeType: "application/dwg",
			fileHash: "abc123",
			fileStatus: "COMPLETED",
			createdAt: new Date(),
			updatedAt: new Date(),
			deletedAt: null,
			ownerId: "u1",
			personalSpaceKey: null,
			libraryKey: null,
			projectId: "proj-1",
			_count: { children: 0, projectMembers: 1 },
			...overrides,
		};
	}

	// ==================== search() scope dispatch ====================
	describe("search scope dispatch", () => {
		it("throws for unknown scope", async () => {
			await expect(
				service.search("u1", { keyword: "test", scope: "invalid" as any }),
			).rejects.toThrow(BadRequestException);
		});
	});

	// ==================== PROJECT scope ====================
	describe("scope = PROJECT", () => {
		it("searches all user projects (filter=all)", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([makeNode()]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(1);

			const result = await service.search("u1", {
				keyword: "project",
				scope: SearchScope.PROJECT,
				filter: "all",
				page: 1,
				limit: 50,
			} as any);

			expect(result.total).toBe(1);
			expect(result.nodes).toHaveLength(1);
			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalled();
		});

		it("filters by owned projects (filter=owned)", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "my",
				scope: SearchScope.PROJECT,
				filter: "owned",
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.isRoot).toBe(true);
			expect(where.ownerId).toBe("u1");
		});

		it("filters by joined projects (filter=joined)", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "shared",
				scope: SearchScope.PROJECT,
				filter: "joined",
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.ownerId).toEqual({ not: "u1" });
			expect(where.projectMembers).toBeDefined();
		});

		it("returns empty when no matches", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "zzz_nonexistent",
				scope: SearchScope.PROJECT,
			} as any);

			expect(result.nodes).toEqual([]);
			expect(result.total).toBe(0);
		});
	});

	// ==================== PROJECT_FILES scope ====================
	describe("scope = PROJECT_FILES", () => {
		it("throws when projectId is missing", async () => {
			await expect(
				service.search("u1", {
					keyword: "test",
					scope: SearchScope.PROJECT_FILES,
				} as any),
			).rejects.toThrow(BadRequestException);
		});

		it("returns empty when user has no access", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(false);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PROJECT_FILES,
				projectId: "p1",
			} as any);

			expect(result.nodes).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("searches project files with permission", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany
				.mockResolvedValueOnce([{ id: "f1" }, { id: "f2" }]) // getAllProjectNodeIds children
				.mockResolvedValueOnce([]); // empty files
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);
			mockPrisma.fileSystemNode.findMany.mockResolvedValueOnce([]); // first call in getAllProjectNodeIds

			const result = await service.search("u1", {
				keyword: "drawing",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
				type: SearchType.FILE,
			} as any);

			expect(mockPermissionService.checkNodePermission).toHaveBeenCalledWith(
				"u1",
				"proj-1",
				ProjectPermission.FILE_OPEN,
			);
			expect(result).toBeDefined();
		});

		it("filters by folder type", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany
				.mockResolvedValueOnce([]) // searchProjectFiles findMany
				.mockResolvedValueOnce([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "folder1",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
				type: SearchType.FOLDER,
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.isFolder).toBe(true);
		});
	});

	// ==================== ALL_PROJECTS scope ====================
	describe("scope = ALL_PROJECTS", () => {
		it("searches across all user projects", async () => {
			mockPrisma.fileSystemNode.findMany
				.mockResolvedValueOnce([{ id: "proj-1" }, { id: "proj-2" }]) // user projects
				.mockResolvedValueOnce([]); // no matching files
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.ALL_PROJECTS,
			} as any);

			// Should query user projects then search within them
			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(2);
			expect(result.total).toBe(0);
		});

		it("returns empty when user has no projects", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.ALL_PROJECTS,
			} as any);

			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(2);
			expect(result.nodes).toEqual([]);
		});
	});

	// ==================== LIBRARY scope ====================
	describe("scope = LIBRARY", () => {
		it("searches library with specific libraryKey", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "block1",
				scope: SearchScope.LIBRARY,
				libraryKey: "drawing",
				type: SearchType.ALL,
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.libraryKey).toEqual({ equals: "drawing" });
		});

		it("searches all libraries when libraryKey not specified", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "common",
				scope: SearchScope.LIBRARY,
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.libraryKey).toEqual({ not: null });
		});

		it("filters by file extension", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "cad",
				scope: SearchScope.LIBRARY,
				extension: ".dwg",
			} as any);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.extension).toBe(".dwg");
		});

		it("handles pagination", async () => {
			const nodes = Array.from({ length: 3 }, (_, i) =>
				makeNode({ id: `n${i}`, name: `f${i}.dwg` }),
			);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue(nodes);
			mockPrisma.fileSystemNode.count.mockResolvedValue(20);

			const result = await service.search("u1", {
				keyword: "drawing",
				scope: SearchScope.LIBRARY,
				page: 1,
				limit: 10,
			} as any);

			expect(result.nodes).toHaveLength(3);
			expect(result.total).toBe(20);
			expect(result.page).toBe(1);
			expect(result.limit).toBe(10);
			expect(result.totalPages).toBe(2);
		});
	});

	// ==================== Edge cases ====================
	describe("edge cases", () => {
		it("handles empty keyword gracefully", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "",
				scope: SearchScope.PROJECT,
			} as any);

			expect(result.nodes).toEqual([]);
		});

		it("handles search with special characters in keyword", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test%_file",
				scope: SearchScope.LIBRARY,
			} as any);

			// Should not throw — special chars are passed through to Prisma's contains
			expect(result).toBeDefined();
		});

		it("defaults to PROJECT_FILES scope when not specified", async () => {
			// Since scope defaults to PROJECT_FILES but no projectId provided, should throw
			await expect(
				service.search("u1", { keyword: "test" } as any),
			).rejects.toThrow(BadRequestException);
		});
	});
});
