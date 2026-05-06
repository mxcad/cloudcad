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
describe("MxCadController", () => {
	let controller: MxCadController;

	const mockMxCadService = {
		getPreloadingData: jest.fn(),
		checkExternalReferenceExists: jest.fn(),
		getExternalReferenceStats: jest.fn(),
		updateExternalReferenceInfo: jest.fn(),
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
	const mockMxcadFileHandler = { serveFile: jest.fn() };
	const mockQuotaEnforcementService = { checkQuota: jest.fn() };
	const mockRuntimeConfigService = { get: jest.fn() };

	beforeEach(async () => {
		jest.clearAllMocks();
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

});
