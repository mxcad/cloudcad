///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { PermissionService } from "../../common/services/permission.service";
import { DatabaseService } from "../../database/database.service";
import { FileSystemPermissionService } from "../../file-system/file-permission/file-system-permission.service";
import { FileTreeService } from "../../file-system/file-tree/file-tree.service";
import { ProjectPermissionService } from "../../roles/project-permission.service";
import { StorageService } from "../../storage/storage.service";
import { VERSION_CONTROL_TOKEN } from "../../version-control/interfaces/version-control.interface";
import { FileConversionService } from "../conversion/file-conversion.service";
import { SaveAsService } from "../save/save-as.service";
import { MxCadController } from "./mxcad.controller";
import { MxCadService } from "./mxcad.service";
import { MxcadFileHandlerService } from "./mxcad-file-handler.service";

describe("MxCadController", () => {
	let controller: MxCadController;

	const mockMxCadService = {
		checkChunkExist: jest.fn(),
		checkFileExist: jest.fn(),
		checkDuplicateFile: jest.fn(),
		getPreloadingData: jest.fn(),
		checkExternalReferenceExists: jest.fn(),
		getExternalReferenceStats: jest.fn(),
		updateExternalReferenceInfo: jest.fn(),
		uploadChunkWithPermission: jest.fn(),
		mergeChunksWithPermission: jest.fn(),
		uploadAndConvertFileWithPermission: jest.fn(),
		checkThumbnailExists: jest.fn(),
		uploadThumbnail: jest.fn(),
		saveMxwebFile: jest.fn(),
		getFileSystemNodeByNodeId: jest.fn(),
		getFileSystemNodeByPath: jest.fn(),
		handleExternalReferenceImage: jest.fn(),
		handleExternalReferenceFile: jest.fn(),
		updateExternalReferenceAfterUpload: jest.fn(),
		logError: jest.fn(),
	};

	const mockPrisma = {
		fileSystemNode: {
			findUnique: jest.fn(),
			findFirst: jest.fn(),
			update: jest.fn(),
		},
		user: {
			findUnique: jest.fn(),
		},
		refreshToken: {
			findFirst: jest.fn(),
		},
	};

	const mockJwtService = {
		verify: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn((key: string) => {
			if (key === "mxcad.fileExt") return ".mxweb";
			if (key === "cacheTTL") return { mxcad: 300 };
			if (key === "filesDataPath") return "/fake/filesData";
			return undefined;
		}),
	};

	const mockStorageService = {
		getFileStream: jest.fn(),
		fileExists: jest.fn(),
		getFileInfo: jest.fn(),
	};

	const mockFileSystemPermission = { getNodeAccessRole: jest.fn() };
	const mockFileTreeService = {
		getProjectId: jest.fn(),
		getLibraryKey: jest.fn(),
	};
	const mockPermissionService = {
		checkNodePermission: jest.fn(),
		getNodeAccessRole: jest.fn(),
	};
	const mockProjectPermissionService = {
		checkPermission: jest.fn(),
	};
	const mockVersionControlService = {};
	const mockFileConversionService = {};
	const mockSaveAsService = { saveMxwebAs: jest.fn() };
	const mockMxcadFileHandler = { serveFile: jest.fn() };

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			controllers: [MxCadController],
			providers: [
				{ provide: MxCadService, useValue: mockMxCadService },
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: JwtService, useValue: mockJwtService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: StorageService, useValue: mockStorageService },
				{
					provide: FileSystemPermissionService,
					useValue: mockFileSystemPermission,
				},
				{ provide: FileTreeService, useValue: mockFileTreeService },
				{ provide: PermissionService, useValue: mockPermissionService },
				{
					provide: ProjectPermissionService,
					useValue: mockProjectPermissionService,
				},
				{ provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
				{ provide: FileConversionService, useValue: mockFileConversionService },
				{ provide: SaveAsService, useValue: mockSaveAsService },
				{ provide: MxcadFileHandlerService, useValue: mockMxcadFileHandler },
			],
		}).compile();

		controller = module.get<MxCadController>(MxCadController);
	});

	// ==================== checkChunkExist ====================
	describe("checkChunkExist", () => {
		it("should return exists=true when chunk exists", async () => {
			mockMxCadService.checkChunkExist.mockResolvedValue({
				ret: "chunkAlreadyExist",
			});
			const result = await controller.checkChunkExist(
				{
					chunk: 0,
					fileHash: "abc",
					size: 100,
					chunks: 2,
					filename: "f.dwg",
				} as any,
				{ user: { id: "u1", roleId: "USER" } } as any,
			);
			expect(result.exists).toBe(true);
		});

		it("should return exists=false when chunk does not exist", async () => {
			mockMxCadService.checkChunkExist.mockResolvedValue({
				ret: "chunkNoExist",
			});
			const result = await controller.checkChunkExist(
				{
					chunk: 5,
					fileHash: "abc",
					size: 100,
					chunks: 10,
					filename: "f.dwg",
				} as any,
				{ user: { id: "u1", roleId: "USER" } } as any,
			);
			expect(result.exists).toBe(false);
		});
	});

	// ==================== checkFileExist ====================
	describe("checkFileExist", () => {
		it("should return exists=true when file exists", async () => {
			mockMxCadService.checkFileExist.mockResolvedValue({
				ret: "fileAlreadyExist",
				nodeId: "n1",
			});
			mockFileTreeService.getLibraryKey.mockResolvedValue(null);
			mockProjectPermissionService.checkPermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
				projectId: null,
			});
			mockJwtService.verify.mockReturnValue({ sub: "u1" });
			mockPrisma.user.findUnique.mockResolvedValue({
				id: "u1",
				status: "ACTIVE",
				roleId: "USER",
			});
			mockPrisma.fileSystemNode.findUnique
				.mockResolvedValueOnce({ id: "root-1", isRoot: true, projectId: null }) // for libraryKey via getProjectId
				.mockResolvedValueOnce({ id: "root-1", isRoot: true, projectId: null }); // for permission check

			const result = await controller.checkFileExist(
				{ filename: "f.dwg", fileHash: "abc", fileSize: 1000 } as any,
				{
					headers: { authorization: "Bearer token" },
					body: { nodeId: "root-1" },
					query: {},
				} as any,
			);
			expect(result.exists).toBe(true);
		});
	});

	// ==================== checkDuplicateFile ====================
	describe("checkDuplicateFile", () => {
		it("should return isDuplicate=true for duplicate file", async () => {
			mockMxCadService.checkDuplicateFile.mockResolvedValue({
				isDuplicate: true,
				existingNodeId: "existing-1",
				existingFileName: "test.dwg",
			});
			const result = await controller.checkDuplicateFile(
				{ filename: "test.dwg", fileHash: "abc", nodeId: "n1" },
				{} as any,
			);
			expect(result.isDuplicate).toBe(true);
		});

		it("should return isDuplicate=false for new file", async () => {
			mockMxCadService.checkDuplicateFile.mockResolvedValue({
				isDuplicate: false,
			});
			const result = await controller.checkDuplicateFile(
				{ filename: "new.dwg", fileHash: "xyz", nodeId: "n1" },
				{} as any,
			);
			expect(result.isDuplicate).toBe(false);
		});
	});

	// ==================== getPreloadingData ====================
	describe("getPreloadingData", () => {
		it("should return preloading data from cache or service", async () => {
			mockMxCadService.getPreloadingData.mockResolvedValue({
				externalReference: [],
				images: [],
			});
			const result = await controller.getPreloadingData("node-1");
			expect(result).toBeDefined();
		});

		it("should throw NotFoundException when data not found", async () => {
			mockMxCadService.getPreloadingData.mockResolvedValue(null);
			await expect(controller.getPreloadingData("missing")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// ==================== checkExternalReference ====================
	describe("checkExternalReference", () => {
		it("should return exists boolean", async () => {
			mockMxCadService.checkExternalReferenceExists.mockResolvedValue(true);
			const result = await controller.checkExternalReference("node-1", {
				fileName: "ref.dwg",
			});
			expect(result.exists).toBe(true);
		});

		it("should throw BadRequestException without fileName", async () => {
			await expect(
				controller.checkExternalReference("node-1", {} as any),
			).rejects.toThrow(BadRequestException);
		});
	});

	// ==================== refreshExternalReferences ====================
	describe("refreshExternalReferences", () => {
		it("should refresh and return stats", async () => {
			const stats = {
				hasMissing: false,
				missingCount: 0,
				totalCount: 0,
				references: [],
			};
			mockMxCadService.getExternalReferenceStats.mockResolvedValue(stats);
			mockMxCadService.updateExternalReferenceInfo.mockResolvedValue(undefined);
			const result = await controller.refreshExternalReferences("node-1");
			expect(result.code).toBe(0);
		});
	});

	// ==================== saveMxwebToNode ====================
	describe("saveMxwebToNode", () => {
		it("should save mxweb file successfully", async () => {
			mockMxCadService.saveMxwebFile.mockResolvedValue({
				success: true,
				message: "保存成功",
				path: "/some/path",
			});
			const result = await controller.saveMxwebToNode(
				"node-1",
				{ path: "/tmp/test.mxweb", originalname: "test.mxweb" } as any,
				"commit msg",
				undefined,
				{ user: { id: "u1", username: "tester" } } as any,
			);
			expect(result.nodeId).toBe("node-1");
		});

		it("should throw on save failure", async () => {
			mockMxCadService.saveMxwebFile.mockResolvedValue({
				success: false,
				message: "保存失败",
			});
			await expect(
				controller.saveMxwebToNode("node-1", {} as any, "", undefined, {} as any),
			).rejects.toThrow(BadRequestException);
		});
	});

	// ==================== saveMxwebAs ====================
	describe("saveMxwebAs", () => {
		it("should save as and return result", async () => {
			mockSaveAsService.saveMxwebAs.mockResolvedValue({
				success: true,
				message: "保存成功",
				nodeId: "new-node",
			});
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "parent-1",
				isFolder: true,
				personalSpaceKey: null,
			});
			mockPermissionService.checkNodePermission.mockResolvedValue(true);
			mockFileTreeService.getProjectId.mockResolvedValue("proj-1");

			const result = await controller.saveMxwebAs(
				{ path: "/tmp/f.mxweb", originalname: "f.mxweb" } as any,
				{
					targetType: "project",
					targetParentId: "parent-1",
					projectId: "proj-1",
					format: "dwg",
				} as any,
				{ user: { id: "u1", username: "tester" } } as any,
			);
			expect(result.success).toBe(true);
		});

		it("should throw when user not logged in", async () => {
			await expect(
				controller.saveMxwebAs({} as any, {} as any, { user: null } as any),
			).rejects.toThrow(UnauthorizedException);
		});
	});

	// ==================== uploadFile (the main upload handler) ====================
	describe("uploadFile", () => {
		it("should handle merge request (no file, has chunks)", async () => {
			mockMxCadService.mergeChunksWithPermission.mockResolvedValue({
				ret: "ok",
				nodeId: "n1",
			});
			mockJwtService.verify.mockReturnValue({ sub: "u1" });
			mockPrisma.user.findUnique.mockResolvedValue({
				id: "u1",
				status: "ACTIVE",
				roleId: "USER",
			});
			mockFileTreeService.getLibraryKey.mockResolvedValue(null);
			mockProjectPermissionService.checkPermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
				projectId: null,
			});

			const result = await controller.uploadFile(
				[],
				{ hash: "abc", name: "f.dwg", size: 1000, chunks: 5 } as any,
				{
					headers: { authorization: "Bearer token" },
					body: { nodeId: "root-1" },
					query: {},
				} as any,
			);
			expect(result.ret).toBe("ok");
		});

		it("should throw when required params missing", async () => {
			await expect(
				controller.uploadFile([{} as any], { chunk: 0 } as any, {} as any),
			).rejects.toThrow(BadRequestException);
		});

		it("should handle chunk upload", async () => {
			mockMxCadService.uploadChunkWithPermission.mockResolvedValue({
				ret: "ok",
			});
			mockJwtService.verify.mockReturnValue({ sub: "u1" });
			mockPrisma.user.findUnique.mockResolvedValue({
				id: "u1",
				status: "ACTIVE",
				roleId: "USER",
			});
			mockFileTreeService.getLibraryKey.mockResolvedValue(null);
			mockProjectPermissionService.checkPermission.mockResolvedValue(true);
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "root-1",
				isRoot: true,
				projectId: null,
			});

			const result = await controller.uploadFile(
				[{ path: "/tmp/chunk", size: 100 } as any],
				{ hash: "abc", name: "f.dwg", size: 1000, chunk: 0, chunks: 5 } as any,
				{
					headers: { authorization: "Bearer token" },
					body: { nodeId: "root-1" },
					query: {},
				} as any,
			);
			expect(result.ret).toBe("ok");
		});
	});
});
