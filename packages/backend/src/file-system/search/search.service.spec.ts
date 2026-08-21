///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { ProjectPermission } from "../../common/enums/permissions.enum";
import { DatabaseService } from "../../database/database.service";
import { SearchScope, SearchType, SearchDto } from "../dto/search.dto";
import { FileSystemPermissionService } from "../file-permission/file-system-permission.service";
import { FtsQueryBuilder } from "./fts-query-builder";
import { SearchService } from "./search.service";
import { AncestorQueryService } from "../../common/services/ancestor-query.service";

describe("SearchService", () => {
	let service: SearchService;

	const mockPrisma = {
		fileSystemNode: {
			findMany: jest.fn(),
			count: jest.fn(),
			findFirst: jest.fn(),
		},
		$queryRaw: jest.fn(),
	};

	const mockPermissionService = {
		checkNodePermission: jest.fn(),
	};

	const mockFtsQueryBuilder = {
		matchIds: jest.fn(),
		buildSearchOrConditions: jest.fn(),
	};

	const mockAncestorQueryService = {
		buildAncestorPaths: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		// Set default mock implementations (resetMocks: true in jest.config clears them between tests)
		mockPrisma.$queryRaw.mockResolvedValue([{ id: "proj-1", path: "root" }]);
		mockAncestorQueryService.buildAncestorPaths.mockResolvedValue(new Map());
		mockPrisma.fileSystemNode.findFirst.mockResolvedValue({ id: "ps-root" });
		mockPermissionService.checkNodePermission.mockResolvedValue(true);
		mockFtsQueryBuilder.matchIds.mockResolvedValue({ ids: new Set(), matched: false });
		mockFtsQueryBuilder.buildSearchOrConditions.mockImplementation((_keyword: string, ftsMatch: { ids: Set<string>; matched: boolean }) => {
			const ilikeConditions = [
				{ name: { contains: _keyword, mode: 'insensitive' } },
				{ description: { contains: _keyword, mode: 'insensitive' } },
			];
			if (ftsMatch.matched) {
				return [{ id: { in: [...ftsMatch.ids] } }, ...ilikeConditions];
			}
			return ilikeConditions;
		});

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SearchService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{
					provide: FileSystemPermissionService,
					useValue: mockPermissionService,
				},
				{ provide: FtsQueryBuilder, useValue: mockFtsQueryBuilder },
				{ provide: AncestorQueryService, useValue: mockAncestorQueryService },
			],
		}).compile();

		service = module.get<SearchService>(SearchService);
	});

	// Helper: minimal node shape returned by Prisma
	function makeNode(overrides: Record<string, unknown> = {}) {
		return {
			id: "n1",
			name: "file.dwg",
			description: null,
			nodeType: "FILE",
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
			projectId: "proj-1",
			_count: { children: 0, projectMembers: 1 },
			...overrides,
		};
	}

	// ==================== search() scope dispatch ====================
	describe("search scope dispatch", () => {
		it("throws for unknown scope", async () => {
			await expect(
				service.search("u1", { keyword: "test", scope: "invalid" as SearchScope }),
			).rejects.toThrow(BadRequestException);
		});

		it("throws for invalid sortBy field", async () => {
			await expect(
				service.search("u1", { keyword: "test", scope: SearchScope.PROJECT, sortBy: "malicious" } as SearchDto),
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
			} as SearchDto);

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
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.nodeType).toBe("PROJECT");
			expect(where.AND).toBeDefined();
			expect(where.AND[0].ownerId).toBe("u1");
		});

		it("filters by joined projects (filter=joined)", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "shared",
				scope: SearchScope.PROJECT,
				filter: "joined",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.AND).toBeDefined();
			expect(where.AND[0].projectMembers).toBeDefined();
			expect(where.AND[1].ownerId).toEqual({ not: "u1" });
		});

		it("returns empty when no matches", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "zzz_nonexistent",
				scope: SearchScope.PROJECT,
			} as SearchDto);

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
				} as SearchDto),
			).rejects.toThrow(BadRequestException);
		});

		it("returns empty when user has no access", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(false);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PROJECT_FILES,
				projectId: "p1",
			} as SearchDto);

			expect(result.nodes).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("searches project files with permission", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "drawing",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
				type: SearchType.FILE,
			} as SearchDto);

			expect(mockPermissionService.checkNodePermission).toHaveBeenCalledWith(
				"u1",
				"proj-1",
				ProjectPermission.FILE_OPEN,
			);
			expect(result).toBeDefined();
		});

		it("filters by folder type", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "folder1",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
				type: SearchType.FOLDER,
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.nodeType).toBe("FOLDER");
		});

		it("parses multiple ext: syntax tokens into multi-extension filter", async () => {
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			// 回归：格式多选（ext:.dwg ext:.mxweb）应同时包含两种格式，
			// 而非 last-wins 只剩最后一个（列表空白/只显示单格式）
			await service.search("u1", {
				keyword: "ext:.dwg ext:.mxweb",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.AND).toContainEqual({
				OR: [
					{ nodeType: "FOLDER" },
					{ extension: { in: [".dwg", ".mxweb"] } },
				],
			});
		});
	});

	// ==================== ALL_PROJECTS scope ====================
	describe("scope = ALL_PROJECTS", () => {
		it("searches across all user projects", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.ALL_PROJECTS,
			} as SearchDto);

			// Merged into single JOIN query — only one findMany call
			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(1);
			expect(result.total).toBe(0);
		});

		it("returns empty when user has no projects", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.ALL_PROJECTS,
			} as SearchDto);

			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(1);
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
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.nodeType).toBe("LIBRARY_DRAWING");
		});

		it("searches all libraries when libraryKey not specified", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "common",
				scope: SearchScope.LIBRARY,
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expect(where.nodeType).toEqual({ in: ["LIBRARY_DRAWING", "LIBRARY_BLOCK"] });
		});

		it("filters by file extension", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "cad",
				scope: SearchScope.LIBRARY,
				extension: ".dwg",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[1][0].where;
			expect(where.extension).toEqual({ in: [".dwg"] });
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
			} as SearchDto);

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
			} as SearchDto);

			expect(result.nodes).toEqual([]);
		});

		it("handles search with special characters in keyword", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test%_file",
				scope: SearchScope.LIBRARY,
			} as SearchDto);

			// Should not throw — special chars are passed through to Prisma's contains
			expect(result).toBeDefined();
		});

		it("defaults to PROJECT_FILES scope when not specified", async () => {
			// Since scope defaults to PROJECT_FILES but no projectId provided, should throw
			await expect(
				service.search("u1", { keyword: "test" } as SearchDto),
			).rejects.toThrow(BadRequestException);
		});
	});

	// ==================== FTS integration ====================
	describe("FTS integration", () => {
		it("uses FTS + ILIKE OR when FTS matches (PROJECT scope)", async () => {
			mockFtsQueryBuilder.matchIds.mockResolvedValue({
				ids: new Set(["proj-1", "proj-2"]),
				matched: true,
			});
			mockFtsQueryBuilder.buildSearchOrConditions.mockReturnValue([
				{ id: { in: ["proj-1", "proj-2"] } },
				{ name: { contains: "test", mode: "insensitive" } },
				{ description: { contains: "test", mode: "insensitive" } },
			]);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PROJECT,
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			// FTS IDs + ILIKE in OR
			expect(where.OR).toBeDefined();
			expect(where.OR).toContainEqual({ id: { in: ["proj-1", "proj-2"] } });
			expect(where.OR).toContainEqual({ name: { contains: "test", mode: "insensitive" } });
			// Permissions still in AND
			expect(where.AND).toBeDefined();
		});

		it("combines FTS with ILIKE for project files (PROJECT_FILES)", async () => {
			mockFtsQueryBuilder.matchIds.mockResolvedValue({
				ids: new Set(["f1", "f2", "f3"]),
				matched: true,
			});
			mockFtsQueryBuilder.buildSearchOrConditions.mockReturnValue([
				{ id: { in: ["f1", "f2", "f3"] } },
				{ name: { contains: "test", mode: "insensitive" } },
				{ description: { contains: "test", mode: "insensitive" } },
			]);
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			// Project scope via relation filter (no `id IN (all subtree ids)` expansion, see #225)
			expect(where.projectId).toBe("proj-1");
			// FTS + ILIKE in OR (not mutually exclusive anymore)
			expect(where.OR).toBeDefined();
			expect(where.OR).toContainEqual({ id: { in: ["f1", "f2", "f3"] } });
			expect(where.OR).toContainEqual({ name: { contains: "test", mode: "insensitive" } });
		});

		it("falls back to ILIKE when FTS returns no matches (PROJECT_FILES)", async () => {
			mockFtsQueryBuilder.matchIds.mockResolvedValue({
				ids: new Set(["outside-node"]),
				matched: true,
			});
			mockFtsQueryBuilder.buildSearchOrConditions.mockReturnValue([
				{ id: { in: ["outside-node"] } },
				{ name: { contains: "test", mode: "insensitive" } },
				{ description: { contains: "test", mode: "insensitive" } },
			]);
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			const result = await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PROJECT_FILES,
				projectId: "proj-1",
			} as SearchDto);

			// Now uses combined FTS+ILIKE, so Prisma query IS called
			expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalled();
			expect(result).toBeDefined();
		});
	});

	// ==================== PERSONAL_SPACE scope ====================
	describe("scope = PERSONAL_SPACE", () => {
		// 个人空间范围 = ps-root 全子树（语义对齐旧实现沿 parentId 向下展开遍历）：
		// 各项目成员节点 + 顶层直挂节点（含 PROJECT 根自身）。注意与 PROJECT_FILES 不同——
		// 个人空间内各项目成员的 projectId=各自项目根、PROJECT 根自身 projectId=null，
		// 因此范围必须由 relation filter（project.parentId=ps-root）+ projectId/parentId 组合表达。
		function expectScopeCoversWholePersonalSpace(where: any) {
			const scope = where.AND[0].OR;
			// 各项目成员节点：projectId 指向个人空间下某项目根
			expect(scope).toContainEqual({
				project: { nodeType: "PROJECT", parentId: "ps-root" },
			});
			// 个人空间直挂区域节点（projectId 指向个人空间根）
			expect(scope).toContainEqual({ projectId: "ps-root" });
			// 顶层直挂节点（含 PROJECT 根自身 projectId=null，仅能经 parentId 匹配）
			expect(scope).toContainEqual({ parentId: "ps-root" });
			// ps-root 自身排除（PERSONAL_SPACE 根）
			expect(where.nodeType).toEqual({ not: "PERSONAL_SPACE" });
		}

		it("searches entire personal space when no current node is given", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PERSONAL_SPACE,
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			expectScopeCoversWholePersonalSpace(where);
		});

		it("searches personal space when projectId is provided", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PERSONAL_SPACE,
				projectId: "proj-a",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			// 传入项目 id 不缩小范围：仍是整个个人空间（各项目 + 直挂节点）
			expectScopeCoversWholePersonalSpace(where);
		});

		it("ignores nodeId that does not belong to the user's personal space", async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
			mockPrisma.fileSystemNode.count.mockResolvedValue(0);

			await service.search("u1", {
				keyword: "test",
				scope: SearchScope.PERSONAL_SPACE,
				projectId: "proj-a",
			} as SearchDto);

			const where = mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where;
			// 范围锚定 ps-root 全子树，不依赖传入的 projectId
			expectScopeCoversWholePersonalSpace(where);
			expect(JSON.stringify(where)).not.toContain("proj-a");
		});
	});
});
