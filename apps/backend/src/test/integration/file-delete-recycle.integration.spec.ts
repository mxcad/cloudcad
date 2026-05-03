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

import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { StorageManager } from "../../common/services/storage-manager.service";
import { DatabaseService } from "../../database/database.service";
import { FileOperationsService } from "../../file-operations/file-operations.service";
import { FileTreeService } from "../../file-system/file-tree/file-tree.service";
import { StorageInfoService } from "../../file-system/storage-quota/storage-info.service";
import { VERSION_CONTROL_TOKEN } from "../../version-control/interfaces/version-control.interface";

describe("File Delete & Recycle Integration Tests", () => {
	let fileOperationsService: FileOperationsService;
	let databaseService: DatabaseService;
	let testUserId: string;
	let testProjectId: string;

	// Mock dependencies
	const mockStorageManager = {
		getFullPath: jest.fn(),
		getNodeDirectoryRelativePath: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue("/test/path"),
	};

	const mockVersionControlService = {
		isReady: jest.fn().mockReturnValue(false),
	};

	const mockStorageInfoService = {
		invalidateQuotaCache: jest.fn(),
	};

	const mockFileTreeService = {
		getProjectId: jest.fn(),
	};

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			providers: [
				FileOperationsService,
				{
					provide: DatabaseService,
					useValue: {
						fileSystemNode: {
							findUnique: jest.fn(),
							findMany: jest.fn(),
							create: jest.fn(),
							update: jest.fn(),
							delete: jest.fn(),
							count: jest.fn(),
						},
						user: {
							create: jest.fn(),
						},
						$transaction: jest.fn(),
					},
				},
				{ provide: StorageManager, useValue: mockStorageManager },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
				{ provide: StorageInfoService, useValue: mockStorageInfoService },
				{ provide: FileTreeService, useValue: mockFileTreeService },
			],
		}).compile();

		fileOperationsService = moduleFixture.get<FileOperationsService>(
			FileOperationsService,
		);
		databaseService = moduleFixture.get<DatabaseService>(DatabaseService);

		// Create test user
		testUserId = "test-user-id";

		// Create test project
		testProjectId = "test-project-id";

		jest.clearAllMocks();
	});

	describe("Test Case 1: Multiple references - delete one should only decrease count", () => {
		it("should verify that deleting one of multiple files with same hash does not delete the physical file", async () => {
			const fileHash = "common-hash-123";

			// Mock file 1 with common hash
			const file1 = {
				id: "file1-id",
				name: "file1.dwg",
				isFolder: false,
				isRoot: false,
				parentId: testProjectId,
				ownerId: testUserId,
				fileHash,
				fileStatus: "COMPLETED",
				deletedAt: null,
			};

			// Setup mocks
			(
				databaseService.fileSystemNode.findUnique as jest.Mock
			).mockResolvedValueOnce(file1);

			// When counting references, should find 1 other file with same hash still active
			(databaseService.fileSystemNode.count as jest.Mock).mockResolvedValueOnce(
				1,
			);

			// Execute delete
			const result = await fileOperationsService.deleteNode(file1.id, false);

			// Verify file is soft deleted (moved to recycle bin)
			expect(result.message).toContain("回收站");

			// Verify reference count check was performed
			expect(databaseService.fileSystemNode.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						fileHash,
						deletedAt: null,
						id: { not: file1.id },
					}),
				}),
			);
		});
	});

	describe("Test Case 2: Zero references - delete should move to recycle bin", () => {
		it("should verify that deleting the last reference moves file to recycle bin", async () => {
			const fileHash = "unique-hash-456";

			// Mock file with unique hash
			const file = {
				id: "unique-file-id",
				name: "unique-file.dwg",
				isFolder: false,
				isRoot: false,
				parentId: testProjectId,
				ownerId: testUserId,
				fileHash,
				fileStatus: "COMPLETED",
				deletedAt: null,
			};

			// Setup mocks
			(
				databaseService.fileSystemNode.findUnique as jest.Mock
			).mockResolvedValueOnce(file);

			// When counting references, should find 0 other files with same hash
			(databaseService.fileSystemNode.count as jest.Mock).mockResolvedValueOnce(
				0,
			);

			// Execute soft delete
			const result = await fileOperationsService.deleteNode(file.id, false);

			// Verify file is moved to recycle bin
			expect(result.message).toContain("回收站");

			// Verify the update was called to mark as deleted
			expect(databaseService.fileSystemNode.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: file.id },
					data: expect.objectContaining({
						deletedAt: expect.any(Date),
						fileStatus: "DELETED",
					}),
				}),
			);

			// Verify quota cache was invalidated
			expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
		});
	});

	describe("Test Case 3: Restore file - reference count should be restored", () => {
		it("should verify that restoring a file restores the reference count", async () => {
			const fileHash = "restorable-hash-789";

			// Mock deleted file
			const deletedFile = {
				id: "deleted-file-id",
				name: "restored-file.dwg",
				isFolder: false,
				isRoot: false,
				parentId: testProjectId,
				ownerId: testUserId,
				fileHash,
				fileStatus: "DELETED",
				deletedAt: new Date(),
				deletedByCascade: false,
			};

			// Mock parent node exists and is not deleted
			const parentNode = {
				id: testProjectId,
				deletedAt: null,
			};

			// Setup mocks
			(databaseService.fileSystemNode.findUnique as jest.Mock)
				.mockResolvedValueOnce(deletedFile)
				.mockResolvedValueOnce(parentNode);

			// Mock the restore update
			const restoredFile = {
				...deletedFile,
				deletedAt: null,
				fileStatus: "COMPLETED",
			};
			(
				databaseService.fileSystemNode.update as jest.Mock
			).mockResolvedValueOnce(restoredFile);

			// Execute restore
			const result = await fileOperationsService.restoreNode(
				deletedFile.id,
				testUserId,
			);

			// Verify file is restored
			expect(result).toBeDefined();

			// Verify the update was called to restore the file
			expect(databaseService.fileSystemNode.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: deletedFile.id },
					data: expect.objectContaining({
						deletedAt: null,
						fileStatus: "COMPLETED",
					}),
				}),
			);

			// Verify quota cache was invalidated
			expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
		});
	});

	describe("Test Case 4: Full workflow - create → multiple references → delete one → delete last → restore", () => {
		it("should verify the complete file delete and restore workflow", async () => {
			const fileHash = "full-workflow-hash";

			// Create 3 files with same hash
			const file1 = {
				id: "wf-file1",
				name: "wf1.dwg",
				fileHash,
				deletedAt: null,
			};
			const file2 = {
				id: "wf-file2",
				name: "wf2.dwg",
				fileHash,
				deletedAt: null,
			};
			const file3 = {
				id: "wf-file3",
				name: "wf3.dwg",
				fileHash,
				deletedAt: null,
			};

			// Step 1: Delete first file - should have 2 other references
			(
				databaseService.fileSystemNode.findUnique as jest.Mock
			).mockResolvedValueOnce({
				...file1,
				isFolder: false,
				parentId: testProjectId,
				ownerId: testUserId,
			});
			(databaseService.fileSystemNode.count as jest.Mock).mockResolvedValueOnce(
				2,
			); // 2 other references

			const delete1Result = await fileOperationsService.deleteNode(
				file1.id,
				false,
			);
			expect(delete1Result.message).toContain("回收站");

			// Step 2: Delete second file - should have 1 other reference
			jest.clearAllMocks();
			(
				databaseService.fileSystemNode.findUnique as jest.Mock
			).mockResolvedValueOnce({
				...file2,
				isFolder: false,
				parentId: testProjectId,
				ownerId: testUserId,
			});
			(databaseService.fileSystemNode.count as jest.Mock).mockResolvedValueOnce(
				1,
			); // 1 other reference

			const delete2Result = await fileOperationsService.deleteNode(
				file2.id,
				false,
			);
			expect(delete2Result.message).toContain("回收站");

			// Step 3: Delete third file - should have 0 other references
			jest.clearAllMocks();
			(
				databaseService.fileSystemNode.findUnique as jest.Mock
			).mockResolvedValueOnce({
				...file3,
				isFolder: false,
				parentId: testProjectId,
				ownerId: testUserId,
			});
			(databaseService.fileSystemNode.count as jest.Mock).mockResolvedValueOnce(
				0,
			); // 0 other references

			const delete3Result = await fileOperationsService.deleteNode(
				file3.id,
				false,
			);
			expect(delete3Result.message).toContain("回收站");

			// Step 4: Restore one file
			jest.clearAllMocks();
			const deletedFile = {
				id: file3.id,
				name: file3.name,
				isFolder: false,
				parentId: testProjectId,
				ownerId: testUserId,
				fileHash,
				fileStatus: "DELETED",
				deletedAt: new Date(),
				deletedByCascade: false,
			};
			(databaseService.fileSystemNode.findUnique as jest.Mock)
				.mockResolvedValueOnce(deletedFile)
				.mockResolvedValueOnce({ id: testProjectId, deletedAt: null });
			(
				databaseService.fileSystemNode.update as jest.Mock
			).mockResolvedValueOnce({
				...deletedFile,
				deletedAt: null,
				fileStatus: "COMPLETED",
			});

			const restoreResult = await fileOperationsService.restoreNode(
				file3.id,
				testUserId,
			);
			expect(restoreResult).toBeDefined();
		});
	});
});
