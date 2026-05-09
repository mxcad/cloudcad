///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	NotFoundException,
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
import { QuotaEnforcementService } from "../../file-system/storage-quota/quota-enforcement.service";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { MxCadController } from "./mxcad.controller";
import { MxCadService } from "./mxcad.service";
import { MxcadFileHandlerService } from "./mxcad-file-handler.service";
import { MxCadRequest } from "../types/request.types";
describe("MxCadController", () => {
	let controller: MxCadController;

	const mockMxCadService = {
		getPreloadingData: jest.fn(),
		checkExternalReferenceExists: jest.fn(),
		getExternalReferenceStats: jest.fn(),
		updateExternalReferenceInfo: jest.fn(),
		checkFileExist: jest.fn(),
		findUserById: jest.fn().mockResolvedValue({
			id: "user-1",
			email: "test@test.com",
			username: "testuser",
			nickname: "Test",
			roleId: "role-1",
			status: "ACTIVE",
		}),
	};

	const mockPrisma = {
		fileSystemNode: {
			findUnique: jest.fn(),
			findFirst: jest.fn(),
			update: jest.fn(),
		},
	};

	const mockJwtService = {
		verify: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn((key: string) => {
			if (key === "conversion.fileExt") return ".mxweb";
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
		getProjectId: jest.fn().mockResolvedValue("project-1"),
		getLibraryKey: jest.fn().mockResolvedValue(null),
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
	const mockMxcadFileHandler = { serveFile: jest.fn() };
	const mockQuotaEnforcementService = { checkQuota: jest.fn() };
	const mockRuntimeConfigService = { get: jest.fn() };

	beforeEach(async () => {
		jest.clearAllMocks();
		mockJwtService.verify.mockReturnValue({ sub: "user-1", role: "ADMIN" });
		mockMxCadService.findUserById.mockResolvedValue({
			id: "user-1",
			email: "test@test.com",
			username: "testuser",
			nickname: "Test",
			roleId: "role-1",
			status: "ACTIVE",
		});
		mockFileTreeService.getLibraryKey.mockResolvedValue(null);
		mockConfigService.get.mockImplementation((key: string) => {
			if (key === "conversion.fileExt") return ".mxweb";
			if (key === "cacheTTL") return { mxcad: 300 };
			if (key === "filesDataPath") return "/fake/filesData";
			return undefined;
		});

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
				{ provide: MxcadFileHandlerService, useValue: mockMxcadFileHandler },
				{ provide: QuotaEnforcementService, useValue: mockQuotaEnforcementService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
			],
		}).compile();

		controller = module.get<MxCadController>(MxCadController);
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
				controller.checkExternalReference("node-1", {} as { fileName: string }),
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

	// ==================== checkFileExist ====================
	describe("checkFileExist", () => {
		const mockRequest = {
			headers: { authorization: "Bearer test-token" },
			user: { id: "user-1", role: "ADMIN" },
			body: { nodeId: "folder-1" },
		} as Partial<MxCadRequest>;

		it("should return exists=true with nodeId when file exists", async () => {
			mockMxCadService.checkFileExist.mockResolvedValue({
				ret: "fileAlreadyExist",
				nodeId: "node-abc",
			});

			const result = await controller.checkFileExist(
				{ filename: "test.dwg", fileHash: "abc123", nodeId: "folder-1", fileSize: 1024 },
				mockRequest,
			);

			expect(result).toEqual({ exists: true, nodeId: "node-abc" });
			expect(mockMxCadService.checkFileExist).toHaveBeenCalledWith(
				"test.dwg",
				"abc123",
				expect.objectContaining({ nodeId: "folder-1", fileSize: 1024 }),
			);
		});

		it("should return exists=false when file does not exist", async () => {
			mockMxCadService.checkFileExist.mockResolvedValue({
				ret: "kConvertFileError",
			});

			const result = await controller.checkFileExist(
				{ filename: "new.dwg", fileHash: "def456", nodeId: "folder-1", fileSize: 2048 },
				mockRequest,
			);

			expect(result).toEqual({ exists: false, nodeId: undefined });
		});
	});

});
