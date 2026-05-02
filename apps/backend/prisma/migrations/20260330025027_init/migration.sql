-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('SYSTEM_USER_READ', 'SYSTEM_USER_CREATE', 'SYSTEM_USER_UPDATE', 'SYSTEM_USER_DELETE', 'SYSTEM_ROLE_READ', 'SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_UPDATE', 'SYSTEM_ROLE_DELETE', 'SYSTEM_ROLE_PERMISSION_MANAGE', 'SYSTEM_FONT_READ', 'SYSTEM_FONT_UPLOAD', 'SYSTEM_FONT_DELETE', 'SYSTEM_FONT_DOWNLOAD', 'SYSTEM_ADMIN', 'SYSTEM_MONITOR', 'SYSTEM_CONFIG_READ', 'SYSTEM_CONFIG_WRITE', 'SYSTEM_TEMPLATE_READ', 'LIBRARY_DRAWING_MANAGE', 'LIBRARY_BLOCK_MANAGE');

-- CreateEnum
CREATE TYPE "ProjectPermission" AS ENUM ('PROJECT_UPDATE', 'PROJECT_DELETE', 'PROJECT_MEMBER_MANAGE', 'PROJECT_MEMBER_ASSIGN', 'PROJECT_TRANSFER', 'PROJECT_ROLE_MANAGE', 'PROJECT_ROLE_PERMISSION_MANAGE', 'FILE_CREATE', 'FILE_UPLOAD', 'FILE_OPEN', 'FILE_EDIT', 'FILE_DELETE', 'FILE_TRASH_MANAGE', 'FILE_DOWNLOAD', 'FILE_MOVE', 'FILE_COPY', 'CAD_SAVE', 'CAD_EXTERNAL_REFERENCE', 'VERSION_READ');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "FontStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PERMISSION_GRANT', 'PERMISSION_REVOKE', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'USER_LOGIN', 'USER_LOGOUT', 'PROJECT_CREATE', 'PROJECT_DELETE', 'FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE', 'FILE_SHARE', 'ADD_MEMBER', 'UPDATE_MEMBER', 'REMOVE_MEMBER', 'TRANSFER_OWNERSHIP');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('SYSTEM', 'USER', 'ROLE', 'PERMISSION', 'PROJECT', 'FILE', 'FOLDER');

-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('SYSTEM', 'PROJECT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('TIME', 'IP', 'DEVICE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INACTIVE',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "category" "RoleCategory" NOT NULL DEFAULT 'SYSTEM',
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_system_nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "originalName" TEXT,
    "path" TEXT,
    "size" INTEGER,
    "mimeType" TEXT,
    "extension" TEXT,
    "fileStatus" "FileStatus",
    "fileHash" TEXT,
    "description" TEXT,
    "projectStatus" "ProjectStatus",
    "personalSpaceKey" TEXT,
    "libraryKey" TEXT,
    "hasMissingExternalReferences" BOOLEAN NOT NULL DEFAULT false,
    "missingExternalReferencesCount" INTEGER NOT NULL DEFAULT 0,
    "externalReferencesJson" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByCascade" BOOLEAN NOT NULL DEFAULT false,
    "deletedFromStorage" TIMESTAMP(3),

    CONSTRAINT "file_system_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_roles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_role_permissions" (
    "id" TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,
    "permission" "ProjectPermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbnail" TEXT,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fonts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "FontStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fonts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileId" TEXT,
    "projectId" TEXT,
    "parentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "totalParts" INTEGER,
    "uploadedParts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_entries" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_policies" (
    "id" TEXT NOT NULL,
    "type" "PolicyType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_permissions" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runtime_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_config_logs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_config_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "roles_parentId_idx" ON "roles"("parentId");

-- CreateIndex
CREATE INDEX "roles_category_idx" ON "roles"("category");

-- CreateIndex
CREATE INDEX "roles_level_idx" ON "roles"("level");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permission_key" ON "role_permissions"("roleId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "unique_personal_space" ON "file_system_nodes"("personalSpaceKey");

-- CreateIndex
CREATE INDEX "file_system_nodes_parentId_idx" ON "file_system_nodes"("parentId");

-- CreateIndex
CREATE INDEX "file_system_nodes_ownerId_idx" ON "file_system_nodes"("ownerId");

-- CreateIndex
CREATE INDEX "file_system_nodes_isRoot_idx" ON "file_system_nodes"("isRoot");

-- CreateIndex
CREATE INDEX "file_system_nodes_isFolder_idx" ON "file_system_nodes"("isFolder");

-- CreateIndex
CREATE INDEX "file_system_nodes_deletedAt_idx" ON "file_system_nodes"("deletedAt");

-- CreateIndex
CREATE INDEX "file_system_nodes_personalSpaceKey_idx" ON "file_system_nodes"("personalSpaceKey");

-- CreateIndex
CREATE INDEX "file_system_nodes_libraryKey_idx" ON "file_system_nodes"("libraryKey");

-- CreateIndex
CREATE INDEX "project_roles_projectId_idx" ON "project_roles"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_roles_projectId_name_key" ON "project_roles"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "project_role_permissions_projectRoleId_permission_key" ON "project_role_permissions"("projectRoleId", "permission");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE INDEX "project_members_projectRoleId_idx" ON "project_members"("projectRoleId");

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_uploadId_key" ON "upload_sessions"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "cache_entries_key_key" ON "cache_entries"("key");

-- CreateIndex
CREATE INDEX "cache_entries_expiresAt_idx" ON "cache_entries"("expiresAt");

-- CreateIndex
CREATE INDEX "cache_entries_lastAccessedAt_idx" ON "cache_entries"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "cache_entries_accessCount_idx" ON "cache_entries"("accessCount");

-- CreateIndex
CREATE INDEX "permission_policies_type_idx" ON "permission_policies"("type");

-- CreateIndex
CREATE INDEX "permission_policies_enabled_idx" ON "permission_policies"("enabled");

-- CreateIndex
CREATE INDEX "permission_policies_priority_idx" ON "permission_policies"("priority");

-- CreateIndex
CREATE INDEX "policy_permissions_permission_idx" ON "policy_permissions"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "policy_permissions_policyId_permission_key" ON "policy_permissions"("policyId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_configs_key_key" ON "runtime_configs"("key");

-- CreateIndex
CREATE INDEX "runtime_configs_category_idx" ON "runtime_configs"("category");

-- CreateIndex
CREATE INDEX "runtime_config_logs_key_idx" ON "runtime_config_logs"("key");

-- CreateIndex
CREATE INDEX "runtime_config_logs_createdAt_idx" ON "runtime_config_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_system_nodes" ADD CONSTRAINT "file_system_nodes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_system_nodes" ADD CONSTRAINT "file_system_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "file_system_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "file_system_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_role_permissions" ADD CONSTRAINT "project_role_permissions_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "project_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "file_system_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "project_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_permissions" ADD CONSTRAINT "policy_permissions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "permission_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
