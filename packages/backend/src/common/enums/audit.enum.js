/**
 * 审计相关枚举定义
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * 目的：切断 @prisma/client 循环依赖链
 */
/**
 * 审计操作类型
 */
export var AuditAction;
(function (AuditAction) {
    AuditAction["PERMISSION_GRANT"] = "PERMISSION_GRANT";
    AuditAction["PERMISSION_REVOKE"] = "PERMISSION_REVOKE";
    AuditAction["ROLE_CREATE"] = "ROLE_CREATE";
    AuditAction["ROLE_UPDATE"] = "ROLE_UPDATE";
    AuditAction["ROLE_DELETE"] = "ROLE_DELETE";
    AuditAction["USER_LOGIN"] = "USER_LOGIN";
    AuditAction["USER_LOGOUT"] = "USER_LOGOUT";
    AuditAction["PROJECT_CREATE"] = "PROJECT_CREATE";
    AuditAction["PROJECT_DELETE"] = "PROJECT_DELETE";
    AuditAction["FILE_UPLOAD"] = "FILE_UPLOAD";
    AuditAction["FILE_DOWNLOAD"] = "FILE_DOWNLOAD";
    AuditAction["FILE_DELETE"] = "FILE_DELETE";
    AuditAction["FILE_SHARE"] = "FILE_SHARE";
    AuditAction["ADD_MEMBER"] = "ADD_MEMBER";
    AuditAction["UPDATE_MEMBER"] = "UPDATE_MEMBER";
    AuditAction["REMOVE_MEMBER"] = "REMOVE_MEMBER";
    AuditAction["TRANSFER_OWNERSHIP"] = "TRANSFER_OWNERSHIP";
})(AuditAction || (AuditAction = {}));
/**
 * 资源类型
 */
export var ResourceType;
(function (ResourceType) {
    ResourceType["SYSTEM"] = "SYSTEM";
    ResourceType["USER"] = "USER";
    ResourceType["ROLE"] = "ROLE";
    ResourceType["PERMISSION"] = "PERMISSION";
    ResourceType["PROJECT"] = "PROJECT";
    ResourceType["FILE"] = "FILE";
    ResourceType["FOLDER"] = "FOLDER";
})(ResourceType || (ResourceType = {}));
//# sourceMappingURL=audit.enum.js.map