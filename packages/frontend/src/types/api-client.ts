import type {
  OpenAPIClient,
  Parameters,
  UnknownParamsObject,
  OperationResponse,
  AxiosRequestConfig,
} from 'openapi-client-axios';

declare namespace Components {
    namespace Schemas {
        export interface AdminStatsResponseDto {
            /**
             * 提示消息
             */
            message: string;
            /**
             * 时间戳
             */
            timestamp: string;
        }
        /**
         * 权限列表
         */
        export type AllPermissionsEnum = "SYSTEM_USER_READ" | "SYSTEM_USER_CREATE" | "SYSTEM_USER_UPDATE" | "SYSTEM_USER_DELETE" | "SYSTEM_ROLE_READ" | "SYSTEM_ROLE_CREATE" | "SYSTEM_ROLE_UPDATE" | "SYSTEM_ROLE_DELETE" | "SYSTEM_ROLE_PERMISSION_MANAGE" | "SYSTEM_FONT_READ" | "SYSTEM_FONT_UPLOAD" | "SYSTEM_FONT_DELETE" | "SYSTEM_FONT_DOWNLOAD" | "SYSTEM_ADMIN" | "SYSTEM_MONITOR" | "SYSTEM_CONFIG_READ" | "SYSTEM_CONFIG_WRITE" | "PROJECT_UPDATE" | "PROJECT_DELETE" | "PROJECT_MEMBER_MANAGE" | "PROJECT_MEMBER_ASSIGN" | "PROJECT_ROLE_MANAGE" | "PROJECT_ROLE_PERMISSION_MANAGE" | "PROJECT_TRANSFER" | "FILE_CREATE" | "FILE_UPLOAD" | "FILE_OPEN" | "FILE_EDIT" | "FILE_DELETE" | "FILE_TRASH_MANAGE" | "FILE_DOWNLOAD" | "FILE_SHARE" | "CAD_SAVE" | "CAD_EXTERNAL_REFERENCE" | "VERSION_READ" | "VERSION_CREATE" | "VERSION_DELETE" | "VERSION_RESTORE" | "PROJECT_SETTINGS_MANAGE";
        export interface AuthApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 认证响应数据
             */
            data: {
                /**
                 * 访问Token
                 * example:
                 * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                 */
                accessToken: string;
                /**
                 * 刷新Token
                 * example:
                 * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
                 */
                refreshToken: string;
                /**
                 * 用户信息
                 */
                user: {
                    /**
                     * 用户ID
                     * example:
                     * 123e4567-e89b-12d3-a456-426614174000
                     */
                    id: string;
                    /**
                     * 用户邮箱（可能未绑定）
                     * example:
                     * user@example.com
                     */
                    email?: {
                        [key: string]: any;
                    } | null;
                    /**
                     * 用户名
                     * example:
                     * username
                     */
                    username: string;
                    /**
                     * 昵称
                     * example:
                     * 用户昵称
                     */
                    nickname?: string;
                    /**
                     * 头像URL
                     * example:
                     * https://example.com/avatar.jpg
                     */
                    avatar?: string;
                    /**
                     * 用户角色
                     */
                    role: {
                        /**
                         * example:
                         * clxxxxxxx
                         */
                        id?: string;
                        /**
                         * example:
                         * USER
                         */
                        name?: "ADMIN" | "USER_MANAGER" | "FONT_MANAGER" | "USER";
                        /**
                         * example:
                         * 普通用户，基础权限
                         */
                        description?: string | null;
                        /**
                         * example:
                         * true
                         */
                        isSystem?: boolean;
                        permissions?: {
                            permission?: string;
                        }[];
                    };
                    /**
                     * 用户状态
                     * example:
                     * ACTIVE
                     */
                    status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
                    /**
                     * 用户手机号（可能未绑定）
                     * example:
                     * 13800138000
                     */
                    phone?: {
                        [key: string]: any;
                    } | null;
                    /**
                     * 手机号是否已验证
                     * example:
                     * false
                     */
                    phoneVerified?: boolean;
                    /**
                     * 微信 OpenID
                     * example:
                     * oXYZ123...
                     */
                    wechatId?: {
                        [key: string]: any;
                    } | null;
                    /**
                     * 登录方式 (LOCAL | WECHAT)
                     * example:
                     * LOCAL
                     */
                    provider?: string;
                    /**
                     * 是否已设置密码
                     * example:
                     * true
                     */
                    hasPassword?: boolean;
                };
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface AuthResponseDto {
            /**
             * 访问Token
             * example:
             * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
             */
            accessToken: string;
            /**
             * 刷新Token
             * example:
             * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
             */
            refreshToken: string;
            /**
             * 用户信息
             */
            user: {
                /**
                 * 用户ID
                 * example:
                 * 123e4567-e89b-12d3-a456-426614174000
                 */
                id: string;
                /**
                 * 用户邮箱（可能未绑定）
                 * example:
                 * user@example.com
                 */
                email?: {
                    [key: string]: any;
                } | null;
                /**
                 * 用户名
                 * example:
                 * username
                 */
                username: string;
                /**
                 * 昵称
                 * example:
                 * 用户昵称
                 */
                nickname?: string;
                /**
                 * 头像URL
                 * example:
                 * https://example.com/avatar.jpg
                 */
                avatar?: string;
                /**
                 * 用户角色
                 */
                role: {
                    /**
                     * example:
                     * clxxxxxxx
                     */
                    id?: string;
                    /**
                     * example:
                     * USER
                     */
                    name?: "ADMIN" | "USER_MANAGER" | "FONT_MANAGER" | "USER";
                    /**
                     * example:
                     * 普通用户，基础权限
                     */
                    description?: string | null;
                    /**
                     * example:
                     * true
                     */
                    isSystem?: boolean;
                    permissions?: {
                        permission?: string;
                    }[];
                };
                /**
                 * 用户状态
                 * example:
                 * ACTIVE
                 */
                status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
                /**
                 * 用户手机号（可能未绑定）
                 * example:
                 * 13800138000
                 */
                phone?: {
                    [key: string]: any;
                } | null;
                /**
                 * 手机号是否已验证
                 * example:
                 * false
                 */
                phoneVerified?: boolean;
                /**
                 * 微信 OpenID
                 * example:
                 * oXYZ123...
                 */
                wechatId?: {
                    [key: string]: any;
                } | null;
                /**
                 * 登录方式 (LOCAL | WECHAT)
                 * example:
                 * LOCAL
                 */
                provider?: string;
                /**
                 * 是否已设置密码
                 * example:
                 * true
                 */
                hasPassword?: boolean;
            };
        }
        export interface BatchCacheOperationDto {
            /**
             * 缓存键列表
             */
            keys: string[];
            /**
             * TTL（秒）
             */
            ttl?: number;
        }
        export interface BatchOperationResponseDto {
            /**
             * 成功数量
             */
            successCount: number;
            /**
             * 失败数量
             */
            failedCount: number;
            /**
             * 成功 ID 列表
             */
            successIds: string[];
            /**
             * 失败 ID 列表
             */
            failedIds: string[];
            /**
             * 错误信息
             */
            errors?: string[];
        }
        export interface BindEmailApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 消息
                 */
                message: string;
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface BindEmailResponseDto {
            /**
             * 消息
             */
            message: string;
        }
        export interface CacheCleanupDto {
            /**
             * 缓存级别
             */
            level?: "L1" | "L2" | "L3" | "ALL";
            /**
             * 模式（支持通配符）
             */
            pattern?: string;
        }
        export interface CacheMonitoringSummaryDto {
            /**
             * 缓存统计
             */
            stats: {
                [key: string]: any;
            };
            /**
             * 健康状态
             */
            healthStatus: {
                [key: string]: any;
            };
            /**
             * 性能指标
             */
            performanceMetrics: {
                [key: string]: any;
            };
            /**
             * 热点数据
             */
            hotData: string[];
            /**
             * 时间戳
             */
            timestamp: string; // date-time
        }
        export interface CacheRefreshDto {
            /**
             * 缓存键
             */
            key: string;
            /**
             * 是否强制刷新
             */
            force?: boolean;
        }
        export interface CacheWarmupConfigDto {
            /**
             * 是否启用预热
             */
            enabled: boolean;
            /**
             * 预热时间（cron 表达式）
             */
            schedule: string;
            /**
             * 热点数据阈值（次/分钟）
             */
            hotDataThreshold: number;
            /**
             * 最大预热数据量
             */
            maxWarmupSize: number;
            /**
             * 预热数据类型
             */
            dataTypes: string[];
        }
        export interface CacheWarningsDto {
            /**
             * 警告列表
             */
            warnings: string[];
        }
        export type CadDownloadFormat = "dwg" | "dxf" | "mxweb" | "pdf";
        export interface ChangePasswordApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 消息
                 */
                message: string;
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface ChangePasswordDto {
            /**
             * 当前密码（无密码用户可不填）
             * example:
             * OldPassword123!
             */
            oldPassword?: string;
            /**
             * 新密码
             * example:
             * NewPassword123!
             */
            newPassword: string;
        }
        export interface ChangePasswordResponseDto {
            /**
             * 消息
             */
            message: string;
        }
        export interface CheckChunkDto {
            /**
             * 文件 MD5 哈希值
             */
            fileHash: string;
            /**
             * 分片索引（从 0 开始）
             */
            chunk: number;
            /**
             * 总分片数量
             */
            chunks: number;
        }
        export interface CheckChunkExistDto {
            /**
             * 文件 MD5 哈希值
             * example:
             * 25e89b5adf19984330f4e68b0f99db64
             */
            fileHash: string;
            /**
             * 原始文件名
             * example:
             * drawing.dwg
             */
            filename: string;
            /**
             * 节点ID（项目根目录或文件夹的 FileSystemNode ID）
             * example:
             * clx1234567890
             */
            nodeId: string;
            /**
             * 分片索引
             * example:
             * 0
             */
            chunk: number;
            /**
             * 总分片数量
             * example:
             * 10
             */
            chunks: number;
            /**
             * 分片大小（字节）
             * example:
             * 1048576
             */
            size: number;
        }
        export interface CheckChunkResponseDto {
            /**
             * 分片是否存在
             */
            exist: boolean;
        }
        export interface CheckDuplicateFileDto {
            /**
             * 文件 MD5 哈希值
             * example:
             * 25e89b5adf19984330f4e68b0f99db64
             */
            fileHash: string;
            /**
             * 原始文件名
             * example:
             * drawing.dwg
             */
            filename: string;
            /**
             * 目标目录节点 ID
             * example:
             * clx1234567890
             */
            nodeId: string;
            /**
             * 当前打开的文件节点 ID（可选，用于排除当前文件）
             * example:
             * clx9876543210
             */
            currentFileId?: string;
        }
        export interface CheckDuplicateFileResponseDto {
            /**
             * 是否存在重复文件
             * example:
             * false
             */
            isDuplicate: boolean;
            /**
             * 重复文件节点 ID（如果存在）
             * example:
             * clx1234567890
             */
            existingNodeId: string | null;
            /**
             * 重复文件名称（如果存在）
             * example:
             * drawing.dwg
             */
            existingFileName: string | null;
        }
        export interface CheckFileDto {
            /**
             * 文件名
             */
            filename: string;
            /**
             * 文件 MD5 哈希
             */
            fileHash: string;
        }
        export interface CheckFileExistDto {
            /**
             * 文件 MD5 哈希值
             * example:
             * 25e89b5adf19984330f4e68b0f99db64
             */
            fileHash: string;
            /**
             * 原始文件名
             * example:
             * drawing.dwg
             */
            filename: string;
            /**
             * 节点ID（项目根目录或文件夹的 FileSystemNode ID）
             * example:
             * clx1234567890
             */
            nodeId: string;
            /**
             * 文件大小（字节）
             * example:
             * 1024567
             */
            fileSize: number;
            /**
             * 冲突处理策略
             */
            conflictStrategy?: "skip" | "overwrite" | "rename";
        }
        export interface CheckFileResponseDto {
            /**
             * 文件是否已存在
             */
            exist: boolean;
            /**
             * 文件哈希
             */
            hash?: string;
            /**
             * 原始文件名
             */
            fileName?: string;
        }
        export interface CheckReferenceResponseDto {
            /**
             * 文件是否存在
             */
            exists: boolean;
        }
        export interface CheckThumbnailResponseDto {
            /**
             * 响应状态码
             * example:
             * 0
             */
            code: number;
            /**
             * 响应消息
             * example:
             * ok
             */
            message: string;
            /**
             * 缩略图是否存在
             */
            exists: boolean;
        }
        export interface ChunkExistResponseDto {
            /**
             * 分片是否已存在
             */
            exists: boolean;
        }
        export interface CreateProjectRoleDto {
            /**
             * 项目 ID（系统角色不需要）
             * example:
             * 550e8400-e29b-41d4-a716-446655440000
             */
            projectId?: string;
            /**
             * 角色名称
             * example:
             * 项目经理
             */
            name: string;
            /**
             * 角色描述
             * example:
             * 负责项目管理
             */
            description?: string;
            /**
             * 权限列表
             * example:
             * [
             *   "PROJECT_UPDATE",
             *   "PROJECT_DELETE",
             *   "FILE_CREATE"
             * ]
             */
            permissions: string[];
        }
        export interface CreateRoleDto {
            /**
             * 角色名称
             * example:
             * 设计主管
             */
            name: string;
            /**
             * 角色描述
             * example:
             * 负责设计团队的管理工作
             */
            description?: string;
            /**
             * 角色类别
             * example:
             * CUSTOM
             */
            category?: "SYSTEM" | "PROJECT" | "CUSTOM";
            /**
             * 角色级别（用于权限继承）
             * example:
             * 50
             */
            level?: number;
            /**
             * 权限列表（数据库存储格式：大写）
             * example:
             * [
             *   "SYSTEM_USER_READ",
             *   "SYSTEM_ROLE_READ",
             *   "SYSTEM_FONT_READ"
             * ]
             */
            permissions: string[];
        }
        export interface CreateUserDto {
            /**
             * 用户邮箱（可选，当 mailEnabled=true 时建议填写）
             * example:
             * user@example.com
             */
            email?: string; // email
            /**
             * 手机号（中国大陆）
             * example:
             * 13800138000
             */
            phone?: string;
            /**
             * 用户名
             * example:
             * username
             */
            username: string; // ^[a-zA-Z0-9_]+$
            /**
             * 密码
             * example:
             * password123
             */
            password: string;
            /**
             * 昵称
             */
            nickname?: string;
            /**
             * 头像URL
             */
            avatar?: string;
            /**
             * 角色ID
             * example:
             * clh8x9y0z1a2b3c4d5e6f7g8h9
             */
            roleId?: string;
            /**
             * 手机号是否已验证
             */
            phoneVerified?: boolean;
            /**
             * 邮箱是否已验证
             */
            emailVerified?: boolean;
            /**
             * 微信 OpenID
             */
            wechatId?: string;
            /**
             * 登录方式 (LOCAL | WECHAT)
             */
            provider?: string;
        }
        export interface DeactivateAccountApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 消息
                 */
                message: string;
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface DeactivateAccountDto {
            /**
             * 用户密码（密码登录用户必填）
             * example:
             * UserPassword123!
             */
            password?: string;
            /**
             * 手机验证码（绑定手机的用户必填）
             * example:
             * 123456
             */
            phoneCode?: string;
            /**
             * 邮箱验证码（邮箱注册用户必填）
             * example:
             * 123456
             */
            emailCode?: string;
            /**
             * 微信扫码验证（微信登录用户必填，值为 "confirmed" 表示已确认）
             * example:
             * confirmed
             */
            wechatConfirm?: string;
        }
        export interface DeactivateAccountResponseDto {
            /**
             * 消息
             */
            message: string;
        }
        export interface ExternalReferenceStatsDto {
            /**
             * 新增的外部参照数量
             */
            added?: number;
            /**
             * 更新的外部参照数量
             */
            updated?: number;
            /**
             * 移除的外部参照数量
             */
            removed?: number;
        }
        export interface FileContentResponseDto {
            /**
             * 操作是否成功
             * example:
             * true
             */
            success: boolean;
            /**
             * 响应消息
             * example:
             * 获取成功
             */
            message: string;
            /**
             * 文件内容（Base64 编码）
             * example:
             * base64encodedcontent...
             */
            content?: string;
        }
        export interface FileExistResponseDto {
            /**
             * 文件是否已存在（秒传）
             */
            exists: boolean;
            /**
             * 已存在文件的节点 ID（秒传时返回）
             */
            nodeId?: string;
        }
        export type FileStatus = "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DELETED";
        /**
         * 文件状态
         */
        export type FileStatusEnum = "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DELETED";
        export interface FileSystemNodeDto {
            /**
             * 节点 ID
             */
            id: string;
            /**
             * 节点名称
             */
            name: string;
            /**
             * 节点描述
             */
            description?: string;
            /**
             * 是否为文件夹
             */
            isFolder: boolean;
            /**
             * 是否为根节点
             */
            isRoot: boolean;
            /**
             * 父节点 ID
             */
            parentId?: string;
            /**
             * 文件路径
             */
            path?: string;
            /**
             * 文件大小
             */
            size?: number;
            /**
             * 文件 MIME 类型
             */
            mimeType?: string;
            /**
             * 文件哈希
             */
            fileHash?: string;
            /**
             * 文件状态
             */
            fileStatus?: "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DELETED";
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
            /**
             * 删除时间
             */
            deletedAt?: string; // date-time
            /**
             * 所有者 ID
             */
            ownerId: string;
            /**
             * 私人空间标识（非空表示为私人空间）
             */
            personalSpaceKey?: string;
            /**
             * 公共资源库标识（drawing: 图纸库, block: 图块库）
             */
            libraryKey?: string;
            /**
             * 子节点数量
             */
            childrenCount?: number;
            /**
             * 项目 ID
             */
            projectId?: string;
        }
        export interface FileTypeStatsDto {
            /**
             * DWG 文件数量
             */
            dwg: number;
            /**
             * DXF 文件数量
             */
            dxf: number;
            /**
             * 其他文件数量
             */
            other: number;
        }
        /**
         * 上传目标
         */
        export type FontUploadTarget = "backend" | "frontend" | "both";
        export interface ForgotPasswordApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 消息
                 */
                message: string;
                /**
                 * 邮件服务是否启用
                 */
                mailEnabled: boolean;
                /**
                 * 短信服务是否启用
                 */
                smsEnabled: boolean;
                /**
                 * 客服邮箱（邮件禁用时返回）
                 */
                supportEmail?: string | null;
                /**
                 * 客服电话（邮件禁用时返回）
                 */
                supportPhone?: string | null;
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface ForgotPasswordDto {
            /**
             * 邮箱地址
             * example:
             * user@example.com
             */
            email?: string;
            /**
             * 手机号码
             * example:
             * 13800138000
             */
            phone?: string;
            /**
             * 验证联系方式（内部使用，用于触发邮箱或手机号验证器）
             * example:
             *
             */
            validateContact: string;
        }
        export interface ForgotPasswordResponseDto {
            /**
             * 消息
             */
            message: string;
            /**
             * 邮件服务是否启用
             */
            mailEnabled: boolean;
            /**
             * 短信服务是否启用
             */
            smsEnabled: boolean;
            /**
             * 客服邮箱（邮件禁用时返回）
             */
            supportEmail?: string | null;
            /**
             * 客服电话（邮件禁用时返回）
             */
            supportPhone?: string | null;
        }
        export interface LoginDto {
            /**
             * 邮箱、用户名或手机号
             * example:
             * user@example.com
             */
            account: string;
            /**
             * 密码
             * example:
             * Password123!
             */
            password: string;
        }
        export interface MergeChunksDto {
            /**
             * 文件 MD5 哈希值
             */
            hash: string;
            /**
             * 原始文件名
             */
            name: string;
            /**
             * 文件总大小（字节）
             */
            size: number;
            /**
             * 总分片数量
             */
            chunks: number;
        }
        export interface MergeCompleteResponseDto {
            /**
             * 操作结果
             * example:
             * success
             */
            ret: string;
            /**
             * 文件哈希
             */
            hash: string;
            /**
             * 原始文件名
             */
            fileName: string;
        }
        export interface NodeListResponseDto {
            /**
             * 节点列表
             */
            nodes: FileSystemNodeDto[];
            /**
             * 总数
             */
            total: number;
            /**
             * 当前页码
             */
            page: number;
            /**
             * 每页数量
             */
            limit: number;
            /**
             * 总页数
             */
            totalPages: number;
        }
        export interface NodeTreeResponseDto {
            /**
             * 节点 ID
             */
            id: string;
            /**
             * 节点名称
             */
            name: string;
            /**
             * 节点描述
             */
            description?: string;
            /**
             * 是否为文件夹
             */
            isFolder: boolean;
            /**
             * 是否为根节点
             */
            isRoot: boolean;
            /**
             * 父节点 ID
             */
            parentId?: string;
            /**
             * 文件路径
             */
            path?: string;
            /**
             * 文件大小
             */
            size?: number;
            /**
             * 文件 MIME 类型
             */
            mimeType?: string;
            /**
             * 文件哈希
             */
            fileHash?: string;
            /**
             * 文件状态
             */
            fileStatus?: "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DELETED";
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
            /**
             * 删除时间
             */
            deletedAt?: string; // date-time
            /**
             * 所有者 ID
             */
            ownerId: string;
            /**
             * 私人空间标识（非空表示为私人空间）
             */
            personalSpaceKey?: string;
            /**
             * 公共资源库标识（drawing: 图纸库, block: 图块库）
             */
            libraryKey?: string;
            /**
             * 子节点数量
             */
            childrenCount?: number;
            /**
             * 项目 ID
             */
            projectId?: string;
            /**
             * 子节点
             */
            children?: FileSystemNodeDto[];
        }
        export interface OperationSuccessDto {
            /**
             * 操作结果消息
             */
            message: string;
            /**
             * 受影响的节点 ID
             */
            nodeId?: string;
            /**
             * 是否成功
             */
            success: boolean;
        }
        export interface PerformanceTrendDto {
            /**
             * 时间戳数组
             */
            timestamps: string[];
            /**
             * 平均响应时间数组
             */
            avgResponseTimes: string[];
            /**
             * 错误率数组
             */
            errorRates: string[];
        }
        /**
         * 统一权限枚举
         */
        export type Permission = "SYSTEM_USER_READ" | "SYSTEM_USER_CREATE" | "SYSTEM_USER_UPDATE" | "SYSTEM_USER_DELETE" | "SYSTEM_ROLE_READ" | "SYSTEM_ROLE_CREATE" | "SYSTEM_ROLE_UPDATE" | "SYSTEM_ROLE_DELETE" | "SYSTEM_ROLE_PERMISSION_MANAGE" | "SYSTEM_FONT_READ" | "SYSTEM_FONT_UPLOAD" | "SYSTEM_FONT_DELETE" | "SYSTEM_FONT_DOWNLOAD" | "SYSTEM_ADMIN" | "SYSTEM_MONITOR" | "SYSTEM_CONFIG_READ" | "SYSTEM_CONFIG_WRITE" | "PROJECT_UPDATE" | "PROJECT_DELETE" | "PROJECT_MEMBER_MANAGE" | "PROJECT_MEMBER_ASSIGN" | "PROJECT_ROLE_MANAGE" | "PROJECT_ROLE_PERMISSION_MANAGE" | "PROJECT_TRANSFER" | "FILE_CREATE" | "FILE_UPLOAD" | "FILE_OPEN" | "FILE_EDIT" | "FILE_DELETE" | "FILE_TRASH_MANAGE" | "FILE_DOWNLOAD" | "FILE_SHARE" | "CAD_SAVE" | "CAD_EXTERNAL_REFERENCE" | "VERSION_READ" | "VERSION_CREATE" | "VERSION_DELETE" | "VERSION_RESTORE" | "PROJECT_SETTINGS_MANAGE";
        export interface PermissionCheckResponseDto {
            /**
             * 项目 ID
             */
            projectId: string;
            /**
             * 用户 ID
             */
            userId: string;
            /**
             * 检查的权限
             */
            permission: string;
            /**
             * 是否有权限
             */
            hasPermission: boolean;
        }
        export interface PermissionsDto {
            /**
             * 权限 ID 列表
             * example:
             * [
             *   "PROJECT_UPDATE",
             *   "PROJECT_DELETE",
             *   "FILE_CREATE"
             * ]
             */
            permissions: string[];
        }
        export interface PreloadingDataDto {
            /**
             * 是否为图纸
             */
            tz: boolean;
            /**
             * 源文件哈希值
             */
            src_file_md5: string;
            /**
             * 图片列表
             */
            images: string[];
            /**
             * 外部参照列表
             */
            externalReference: string[];
        }
        export interface ProjectDto {
            /**
             * 项目 ID
             */
            id: string;
            /**
             * 项目名称
             */
            name: string;
            /**
             * 项目描述
             */
            description?: string;
            /**
             * 项目状态
             */
            status: "ACTIVE" | "ARCHIVED" | "DELETED";
            /**
             * 所有者 ID
             */
            ownerId: string;
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
            /**
             * 删除时间
             */
            deletedAt?: string; // date-time
            /**
             * 成员数量
             */
            memberCount?: number;
        }
        export interface ProjectListResponseDto {
            /**
             * 节点列表
             */
            nodes: FileSystemNodeDto[];
            /**
             * 总数
             */
            total: number;
            /**
             * 当前页码
             */
            page: number;
            /**
             * 每页数量
             */
            limit: number;
            /**
             * 总页数
             */
            totalPages: number;
        }
        export interface ProjectMemberDto {
            /**
             * 用户 ID
             */
            id: string;
            /**
             * 用户邮箱
             */
            email: string;
            /**
             * 用户名
             */
            username: string;
            /**
             * 用户昵称
             */
            nickname?: string;
            /**
             * 头像 URL
             */
            avatar?: string;
            /**
             * 项目角色 ID
             */
            projectRoleId: string;
            /**
             * 项目角色名称
             */
            projectRoleName: string;
            /**
             * 加入时间
             */
            joinedAt: string; // date-time
        }
        /**
         * 项目权限枚举
         */
        export type ProjectPermission = "PROJECT_UPDATE" | "PROJECT_DELETE" | "PROJECT_MEMBER_MANAGE" | "PROJECT_MEMBER_ASSIGN" | "PROJECT_ROLE_MANAGE" | "PROJECT_ROLE_PERMISSION_MANAGE" | "PROJECT_TRANSFER" | "FILE_CREATE" | "FILE_UPLOAD" | "FILE_OPEN" | "FILE_EDIT" | "FILE_DELETE" | "FILE_TRASH_MANAGE" | "FILE_DOWNLOAD" | "FILE_SHARE" | "CAD_SAVE" | "CAD_EXTERNAL_REFERENCE" | "VERSION_READ" | "VERSION_CREATE" | "VERSION_DELETE" | "VERSION_RESTORE" | "PROJECT_SETTINGS_MANAGE";
        /**
         * 权限名称
         */
        export type ProjectPermissionEnum = "PROJECT_UPDATE" | "PROJECT_DELETE" | "PROJECT_MEMBER_MANAGE" | "PROJECT_MEMBER_ASSIGN" | "PROJECT_ROLE_MANAGE" | "PROJECT_ROLE_PERMISSION_MANAGE" | "PROJECT_TRANSFER" | "FILE_CREATE" | "FILE_UPLOAD" | "FILE_OPEN" | "FILE_EDIT" | "FILE_DELETE" | "FILE_TRASH_MANAGE" | "FILE_DOWNLOAD" | "FILE_SHARE" | "CAD_SAVE" | "CAD_EXTERNAL_REFERENCE" | "VERSION_READ" | "VERSION_CREATE" | "VERSION_DELETE" | "VERSION_RESTORE" | "PROJECT_SETTINGS_MANAGE";
        export interface ProjectRoleDto {
            /**
             * 角色 ID
             */
            id: string;
            /**
             * 项目 ID
             */
            projectId?: string;
            /**
             * 角色名称
             */
            name: string;
            /**
             * 角色描述
             */
            description?: string;
            /**
             * 是否为系统角色
             */
            isSystem: boolean;
            /**
             * 权限列表
             */
            permissions: ProjectRolePermissionDto[];
            /**
             * 成员数量
             */
            _count?: {
                [key: string]: any;
            };
            /**
             * 关联的项目
             */
            project?: {
                [key: string]: any;
            };
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
        }
        export interface ProjectRolePermissionDto {
            /**
             * 权限 ID
             */
            id: string;
            /**
             * 项目角色 ID
             */
            projectRoleId: string;
            /**
             * 权限名称
             */
            permission: "PROJECT_UPDATE" | "PROJECT_DELETE" | "PROJECT_MEMBER_MANAGE" | "PROJECT_MEMBER_ASSIGN" | "PROJECT_ROLE_MANAGE" | "PROJECT_ROLE_PERMISSION_MANAGE" | "PROJECT_TRANSFER" | "FILE_CREATE" | "FILE_UPLOAD" | "FILE_OPEN" | "FILE_EDIT" | "FILE_DELETE" | "FILE_TRASH_MANAGE" | "FILE_DOWNLOAD" | "FILE_SHARE" | "CAD_SAVE" | "CAD_EXTERNAL_REFERENCE" | "VERSION_READ" | "VERSION_CREATE" | "VERSION_DELETE" | "VERSION_RESTORE" | "PROJECT_SETTINGS_MANAGE";
            /**
             * 创建时间
             */
            createdAt: string; // date-time
        }
        /**
         * 项目状态
         */
        export type ProjectStatusEnum = "ACTIVE" | "ARCHIVED" | "DELETED";
        export interface ProjectUserPermissionsDto {
            /**
             * 项目 ID
             */
            projectId: string;
            /**
             * 用户 ID
             */
            userId: string;
            /**
             * 权限列表
             */
            permissions: string[];
        }
        export interface RefreshExternalReferencesResponseDto {
            /**
             * 响应状态码
             * example:
             * 0
             */
            code: number;
            /**
             * 响应消息
             * example:
             * 刷新成功
             */
            message: string;
            /**
             * 外部参照统计信息
             */
            stats?: {
                /**
                 * 新增的外部参照数量
                 */
                added?: number;
                /**
                 * 更新的外部参照数量
                 */
                updated?: number;
                /**
                 * 移除的外部参照数量
                 */
                removed?: number;
            };
        }
        export interface RefreshTokenDto {
            /**
             * 刷新Token
             * example:
             * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
             */
            refreshToken: string;
        }
        export interface RegisterDto {
            /**
             * 用户邮箱（邮件服务启用时可选）
             * example:
             * user@example.com
             */
            email?: string; // email
            /**
             * 用户名
             * example:
             * username
             */
            username: string; // ^[a-zA-Z0-9_]+$
            /**
             * 密码
             * example:
             * password123
             */
            password: string;
            /**
             * 昵称
             * example:
             * 用户昵称
             */
            nickname?: string;
            /**
             * 微信临时 Token（微信登录跳转注册时携带）
             * example:
             * eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
             */
            wechatTempToken?: string;
        }
        export interface ResetPasswordApiResponseDto {
            /**
             * 响应状态码
             * example:
             * SUCCESS
             */
            code: "SUCCESS" | "ERROR";
            /**
             * 响应消息
             * example:
             * 操作成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 消息
                 */
                message: string;
            };
            /**
             * 响应时间戳
             * example:
             * 2025-12-12T03:34:55.801Z
             */
            timestamp: string;
        }
        export interface ResetPasswordDto {
            /**
             * 邮箱地址
             * example:
             * user@example.com
             */
            email?: string;
            /**
             * 手机号码
             * example:
             * 13800138000
             */
            phone?: string;
            /**
             * 验证码
             * example:
             * 123456
             */
            code: string;
            /**
             * 新密码
             * example:
             * NewPassword123!
             */
            newPassword: string;
            /**
             * 确认新密码
             * example:
             * NewPassword123!
             */
            confirmPassword: string;
            /**
             * 验证联系方式（内部使用，用于触发邮箱或手机号验证器）
             * example:
             *
             */
            validateContact: string;
        }
        export interface ResetPasswordResponseDto {
            /**
             * 消息
             */
            message: string;
        }
        export interface RestoreAccountDto {
            /**
             * 恢复验证方式：password | phoneCode | emailCode
             * example:
             * password
             */
            verificationMethod: string;
            /**
             * 密码或验证码
             * example:
             * UserPassword123!
             */
            code: string;
        }
        export interface RestoreAccountResponseDto {
            /**
             * 消息
             */
            message: string;
        }
        /**
         * 角色类别
         */
        export type RoleCategory = "SYSTEM" | "PROJECT" | "CUSTOM";
        /**
         * 角色类别
         */
        export type RoleCategoryEnum = "SYSTEM" | "PROJECT" | "CUSTOM";
        export interface RoleDto {
            /**
             * 角色 ID
             */
            id: string;
            /**
             * 角色名称
             */
            name: string;
            /**
             * 角色描述
             */
            description?: string;
            /**
             * 角色类别
             */
            category: "SYSTEM" | "PROJECT" | "CUSTOM";
            /**
             * 角色级别（用于权限继承）
             */
            level: number;
            /**
             * 是否为系统角色（不可删除）
             */
            isSystem: boolean;
            /**
             * 权限列表
             * example:
             * [
             *   "system:user:read",
             *   "system:role:read",
             *   "system:font:read"
             * ]
             */
            permissions: /* 权限列表 */ AllPermissionsEnum[];
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
        }
        export interface RuntimeConfigDefinitionDto {
            /**
             * 配置键名
             * example:
             * mailEnabled
             */
            key: string;
            /**
             * 值类型
             * example:
             * boolean
             */
            type: "string" | "number" | "boolean";
            /**
             * 分类
             * example:
             * mail
             */
            category: string;
            /**
             * 配置说明
             * example:
             * 邮件服务开关
             */
            description: string;
            /**
             * 默认值（string | number | boolean）
             * example:
             * false
             */
            defaultValue: {
                [key: string]: any;
            };
            /**
             * 是否公开给前端
             * example:
             * true
             */
            isPublic: boolean;
        }
        export interface RuntimeConfigResponseDto {
            /**
             * 配置键名
             * example:
             * mailEnabled
             */
            key: string;
            /**
             * 配置值（string | number | boolean）
             * example:
             * false
             */
            value: {
                [key: string]: any;
            };
            /**
             * 值类型
             * example:
             * boolean
             */
            type: "string" | "number" | "boolean";
            /**
             * 分类
             * example:
             * mail
             */
            category: string;
            /**
             * 配置说明
             * example:
             * 邮件服务开关
             */
            description?: string;
            /**
             * 是否公开给前端
             * example:
             * true
             */
            isPublic: boolean;
            /**
             * 最后修改人 ID
             */
            updatedBy?: string;
            /**
             * 最后更新时间
             * example:
             * 2024-01-01T00:00:00.000Z
             */
            updatedAt: string; // date-time
        }
        export interface SaveMxwebAsDto {
            /**
             * mxweb 文件
             */
            file: string; // binary
            /**
             * 保存类型: personal-我的图纸, project-项目
             */
            targetType: "personal" | "project";
            /**
             * 目标父节点ID
             */
            targetParentId: string;
            /**
             * 项目ID（targetType为project时必填）
             */
            projectId?: string;
            /**
             * 保存格式: dwg, dxf
             */
            format: "dwg" | "dxf";
            /**
             * 提交信息
             */
            commitMessage?: string;
            /**
             * 文件名（不含扩展名）
             */
            fileName?: string;
        }
        export interface SaveMxwebAsResponseDto {
            /**
             * 是否成功
             */
            success: boolean;
            /**
             * 消息
             */
            message: string;
            /**
             * 新文件节点ID
             */
            nodeId: string;
            /**
             * 文件名
             */
            fileName: string;
            /**
             * 文件路径
             */
            path: string;
            /**
             * 项目ID
             */
            projectId?: string;
            /**
             * 父节点ID
             */
            parentId: string;
        }
        export interface SaveMxwebDto {
            /**
             * mxweb 文件
             */
            file: string; // binary
            /**
             * 提交信息
             * example:
             * 保存图纸修改
             */
            commitMessage?: string;
            /**
             * 乐观锁时间戳（覆盖保存时必须提供，首次保存时不需要）
             * example:
             * 2026-05-02T08:30:00.000Z
             */
            expectedTimestamp?: string;
        }
        export interface SaveMxwebResponseDto {
            /**
             * 节点 ID
             */
            nodeId: string;
            /**
             * 文件路径
             */
            path: string;
        }
        export interface SendVerificationApiResponseDto {
            code: SendVerificationResponseDto;
            message: string;
            data: SendVerificationResponseDto;
            timestamp: string;
        }
        export interface SendVerificationResponseDto {
            /**
             * 操作结果
             * example:
             * 验证邮件已发送
             */
            message: string;
        }
        export interface SizeTrendDto {
            /**
             * L1 缓存大小数组
             */
            L1: string[];
            /**
             * L2 缓存大小数组
             */
            L2: string[];
            /**
             * L3 缓存大小数组
             */
            L3: string[];
        }
        export interface StorageInfoDto {
            /**
             * 配额类型
             */
            type: "PERSONAL" | "PROJECT" | "LIBRARY";
            /**
             * 已使用空间（字节）
             */
            used: number;
            /**
             * 总空间（字节）
             */
            total: number;
            /**
             * 剩余空间（字节）
             */
            remaining: number;
            /**
             * 使用百分比
             */
            usagePercent: number;
        }
        /**
         * 配额类型
         */
        export type StorageQuotaTypeEnum = "PERSONAL" | "PROJECT" | "LIBRARY";
        export interface SvnLogEntryDto {
            /**
             * 修订版本号
             * example:
             * 123
             */
            revision: number;
            /**
             * 提交作者
             * example:
             * user@example.com
             */
            author: string;
            /**
             * 提交日期
             * example:
             * 2026-03-03T10:30:00.000Z
             */
            date: string; // date-time
            /**
             * 提交消息
             * example:
             * Update drawing file
             */
            message: string;
            /**
             * 提交用户名称（从提交信息中解析）
             * example:
             * 张三
             */
            userName?: string;
            /**
             * 变更路径列表
             */
            paths?: SvnLogPathDto[];
        }
        export interface SvnLogPathDto {
            /**
             * 变更动作类型
             * example:
             * A
             */
            action: "A" | "M" | "D" | "R";
            /**
             * 路径类型
             * example:
             * file
             */
            kind: "file" | "dir";
            /**
             * 变更路径
             * example:
             * /path/to/file.dwg
             */
            path: string;
        }
        export interface SvnLogResponseDto {
            /**
             * 操作是否成功
             * example:
             * true
             */
            success: boolean;
            /**
             * 响应消息
             * example:
             * 获取成功
             */
            message: string;
            /**
             * 提交记录条目列表
             */
            entries: SvnLogEntryDto[];
        }
        /**
         * 系统权限枚举
         */
        export type SystemPermission = "SYSTEM_USER_READ" | "SYSTEM_USER_CREATE" | "SYSTEM_USER_UPDATE" | "SYSTEM_USER_DELETE" | "SYSTEM_ROLE_READ" | "SYSTEM_ROLE_CREATE" | "SYSTEM_ROLE_UPDATE" | "SYSTEM_ROLE_DELETE" | "SYSTEM_ROLE_PERMISSION_MANAGE" | "SYSTEM_FONT_READ" | "SYSTEM_FONT_UPLOAD" | "SYSTEM_FONT_DELETE" | "SYSTEM_FONT_DOWNLOAD" | "SYSTEM_ADMIN" | "SYSTEM_MONITOR" | "SYSTEM_CONFIG_READ" | "SYSTEM_CONFIG_WRITE";
        export interface TrashListResponseDto {
            /**
             * 节点列表
             */
            nodes: FileSystemNodeDto[];
            /**
             * 总数
             */
            total: number;
            /**
             * 当前页码
             */
            page: number;
            /**
             * 每页数量
             */
            limit: number;
            /**
             * 总页数
             */
            totalPages: number;
        }
        export interface TriggerWarmupDto {
            /**
             * 数据类型
             */
            dataType?: string;
            /**
             * 数据 ID 列表
             */
            ids?: string[];
        }
        export interface UpdateProjectRoleDto {
            /**
             * 角色名称
             * example:
             * 项目经理
             */
            name?: string;
            /**
             * 角色描述
             * example:
             * 负责项目管理
             */
            description?: string;
            /**
             * 权限列表
             * example:
             * [
             *   "PROJECT_UPDATE",
             *   "PROJECT_DELETE",
             *   "FILE_CREATE"
             * ]
             */
            permissions?: string[];
        }
        export interface UpdateRoleDto {
            /**
             * 角色名称
             * example:
             * 设计主管
             */
            name?: string;
            /**
             * 角色描述
             * example:
             * 负责设计团队的管理工作
             */
            description?: string;
            /**
             * 角色类别
             * example:
             * CUSTOM
             */
            category?: "SYSTEM" | "PROJECT" | "CUSTOM";
            /**
             * 角色级别（用于权限继承）
             * example:
             * 50
             */
            level?: number;
            /**
             * 权限列表（更新时完全替换原有权限，数据库存储格式：大写）
             * example:
             * [
             *   "FILE_UPLOAD",
             *   "FILE_OPEN"
             * ]
             */
            permissions?: string[];
        }
        export interface UpdateRuntimeConfigDto {
            /**
             * 配置值（string | number | boolean）
             * example:
             * false
             */
            value: {
                [key: string]: any;
            };
        }
        export interface UpdateUserDto {
            /**
             * 用户邮箱
             */
            email?: string;
            /**
             * 手机号（中国大陆）
             * example:
             * 13800138000
             */
            phone?: string;
            /**
             * 用户名
             */
            username?: string;
            /**
             * 密码
             */
            password?: string;
            /**
             * 昵称
             */
            nickname?: string;
            /**
             * 头像URL
             */
            avatar?: string;
            /**
             * 角色ID
             */
            roleId?: string;
            /**
             * 用户状态
             */
            status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
        }
        export interface UpdateWarmupConfigDto {
            /**
             * 是否启用预热
             */
            enabled?: boolean;
            /**
             * 预热时间（cron 表达式）
             */
            schedule?: string;
            /**
             * 热点数据阈值（次/分钟）
             */
            hotDataThreshold?: number;
            /**
             * 最大预热数据量
             */
            maxWarmupSize?: number;
            /**
             * 预热数据类型
             */
            dataTypes?: string[];
        }
        export interface UploadChunkDto {
            /**
             * 文件 MD5 哈希值
             */
            hash: string;
            /**
             * 原始文件名
             */
            name: string;
            /**
             * 文件总大小（字节）
             */
            size: number;
            /**
             * 当前分片索引（从 0 开始）
             */
            chunk: number;
            /**
             * 总分片数量
             */
            chunks: number;
        }
        export interface UploadChunkResponseDto {
            /**
             * 上传结果
             * example:
             * success
             */
            ret: string;
            /**
             * 是否为最后一个分片
             */
            isLastChunk?: boolean;
        }
        export interface UploadExtReferenceDto {
            /**
             * 源图纸文件的哈希值（主图纸文件的 hash）
             * example:
             * 4b298dd48355af1202b532fc4d051658
             */
            srcFileHash: string;
            /**
             * 外部参照文件名（含扩展名）
             * example:
             * A1.dwg
             */
            extRefFile: string;
            /**
             * 文件哈希值（可选，用于秒传检查）
             */
            hash?: string;
        }
        export interface UploadExtReferenceFileDto {
            /**
             * 上传的文件
             */
            file: string; // binary
            /**
             * 文件哈希值（用于 Multer 文件名生成）
             * example:
             * 25e89b5adf19984330f4e68b0f99db64
             */
            hash?: string;
            /**
             * 源图纸文件的节点 ID（FileSystemNode ID）
             * example:
             * cml8t8wg60004ucufd7pb3sq6
             */
            nodeId?: string;
            /**
             * 外部参照文件名（含扩展名）
             * example:
             * ref1.dwg
             */
            ext_ref_file: string;
            /**
             * 是否更新 mxweb_preloading.json（默认 false）
             * example:
             * false
             */
            updatePreloading?: boolean;
        }
        export interface UploadFileResponseDto {
            /**
             * 上传文件的节点 ID
             */
            nodeId?: string;
            /**
             * 是否为图纸文件
             */
            tz?: boolean;
        }
        export interface UploadFilesDto {
            /**
             * 上传的文件
             */
            file?: string; // binary
            /**
             * 文件 MD5 哈希值
             */
            hash: string;
            /**
             * 原始文件名
             */
            name: string;
            /**
             * 文件总大小（字节）
             */
            size: number;
            /**
             * 分片索引（分片上传时必填）
             */
            chunk?: number;
            /**
             * 总分片数量（分片上传时必填）
             */
            chunks?: number;
            /**
             * 节点ID（项目根目录或文件夹的 FileSystemNode ID）
             */
            nodeId?: string;
            /**
             * 源图纸节点 ID（外部参照上传时使用）
             */
            srcDwgNodeId?: string;
            /**
             * 文件ID（前端传递的标识符）
             */
            id?: string;
            /**
             * 文件类型（如 dwg、dxf）
             */
            type?: string;
            /**
             * 文件最后修改日期
             */
            lastModifiedDate?: string;
            /**
             * 冲突策略：skip（跳过）/ overwrite（覆盖）/ rename（重命名，默认）
             */
            conflictStrategy?: "skip" | "overwrite" | "rename";
        }
        export interface UploadFontDto {
            /**
             * 上传目标
             */
            target: "backend" | "frontend" | "both";
        }
        export interface UploadThumbnailDataDto {
            /**
             * 文件名
             */
            fileName: string;
        }
        export interface UploadThumbnailDto {
            /**
             * 缩略图文件
             */
            file: string; // binary
        }
        export interface UploadThumbnailResponseDto {
            /**
             * 响应状态码
             * example:
             * 0
             */
            code: number;
            /**
             * 响应消息
             * example:
             * 缩略图上传成功
             */
            message: string;
            /**
             * 响应数据
             */
            data: {
                /**
                 * 文件名
                 */
                fileName: string;
            };
        }
        export interface UserCleanupStatsResponseDto {
            /**
             * 待清理用户数
             * example:
             * 15
             */
            pendingCleanup: number;
            /**
             * 过期截止日期
             * example:
             * 2026-03-11T00:00:00.000Z
             */
            expiryDate: string; // date-time
            /**
             * 延迟天数
             * example:
             * 30
             */
            delayDays: number;
        }
        export interface UserCleanupTriggerDto {
            /**
             * 自定义延迟天数（覆盖默认值）
             * example:
             * 7
             */
            delayDays?: number;
        }
        export interface UserCleanupTriggerResponseDto {
            /**
             * 消息
             * example:
             * 清理完成: 处理 0 个用户
             */
            message: string;
            /**
             * 是否成功
             * example:
             * true
             */
            success: boolean;
            /**
             * 处理的用户数
             * example:
             * 0
             */
            processedUsers: number;
            /**
             * 删除的成员关系数
             * example:
             * 0
             */
            deletedMembers: number;
            /**
             * 删除的项目数
             * example:
             * 0
             */
            deletedProjects: number;
            /**
             * 删除的审计日志数
             * example:
             * 0
             */
            deletedAuditLogs: number;
            /**
             * 标记待清理的存储数
             * example:
             * 0
             */
            markedForStorageCleanup: number;
            /**
             * 错误列表
             * example:
             * []
             */
            errors: string[];
        }
        export interface UserDashboardStatsDto {
            /**
             * 项目数量
             */
            projectCount: number;
            /**
             * 文件总数
             */
            totalFiles: number;
            /**
             * 今日上传数量
             */
            todayUploads: number;
            /**
             * 文件类型统计
             */
            fileTypeStats: {
                /**
                 * DWG 文件数量
                 */
                dwg: number;
                /**
                 * DXF 文件数量
                 */
                dxf: number;
                /**
                 * 其他文件数量
                 */
                other: number;
            };
            /**
             * 存储空间信息
             */
            storage: {
                /**
                 * 配额类型
                 */
                type: "PERSONAL" | "PROJECT" | "LIBRARY";
                /**
                 * 已使用空间（字节）
                 */
                used: number;
                /**
                 * 总空间（字节）
                 */
                total: number;
                /**
                 * 剩余空间（字节）
                 */
                remaining: number;
                /**
                 * 使用百分比
                 */
                usagePercent: number;
            };
        }
        export interface UserDto {
            /**
             * 用户ID
             * example:
             * 123e4567-e89b-12d3-a456-426614174000
             */
            id: string;
            /**
             * 用户邮箱（可能未绑定）
             * example:
             * user@example.com
             */
            email?: {
                [key: string]: any;
            } | null;
            /**
             * 用户名
             * example:
             * username
             */
            username: string;
            /**
             * 昵称
             * example:
             * 用户昵称
             */
            nickname?: string;
            /**
             * 头像URL
             * example:
             * https://example.com/avatar.jpg
             */
            avatar?: string;
            /**
             * 用户角色
             */
            role: {
                /**
                 * example:
                 * clxxxxxxx
                 */
                id?: string;
                /**
                 * example:
                 * USER
                 */
                name?: "ADMIN" | "USER_MANAGER" | "FONT_MANAGER" | "USER";
                /**
                 * example:
                 * 普通用户，基础权限
                 */
                description?: string | null;
                /**
                 * example:
                 * true
                 */
                isSystem?: boolean;
                permissions?: {
                    permission?: string;
                }[];
            };
            /**
             * 用户状态
             * example:
             * ACTIVE
             */
            status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
            /**
             * 用户手机号（可能未绑定）
             * example:
             * 13800138000
             */
            phone?: {
                [key: string]: any;
            } | null;
            /**
             * 手机号是否已验证
             * example:
             * false
             */
            phoneVerified?: boolean;
            /**
             * 微信 OpenID
             * example:
             * oXYZ123...
             */
            wechatId?: {
                [key: string]: any;
            } | null;
            /**
             * 登录方式 (LOCAL | WECHAT)
             * example:
             * LOCAL
             */
            provider?: string;
            /**
             * 是否已设置密码
             * example:
             * true
             */
            hasPassword?: boolean;
        }
        export interface UserListResponseDto {
            /**
             * 用户列表
             */
            users: UserResponseDto[];
            /**
             * 总数
             */
            total: number;
            /**
             * 当前页码
             */
            page: number;
            /**
             * 每页数量
             */
            limit: number;
            /**
             * 总页数
             */
            totalPages: number;
        }
        export interface UserProfileResponseDto {
            /**
             * 用户 ID
             */
            id: string;
            /**
             * 用户邮箱
             */
            email: string;
            /**
             * 用户名
             */
            username: string;
            /**
             * 用户昵称
             */
            nickname?: string;
            /**
             * 头像 URL
             */
            avatar?: string;
            /**
             * 用户状态
             */
            status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
            /**
             * 用户角色
             */
            role: {
                /**
                 * 角色 ID
                 */
                id: string;
                /**
                 * 角色名称
                 */
                name: string;
                /**
                 * 角色描述
                 */
                description?: string;
                /**
                 * 是否为系统角色
                 */
                isSystem: boolean;
            };
            /**
             * 是否已设置密码（手机/微信自动注册用户可能未设置）
             */
            hasPassword: boolean;
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
        }
        export interface UserResponseDto {
            /**
             * 用户 ID
             */
            id: string;
            /**
             * 用户邮箱
             */
            email: string;
            /**
             * 用户名
             */
            username: string;
            /**
             * 用户昵称
             */
            nickname?: string;
            /**
             * 头像 URL
             */
            avatar?: string;
            /**
             * 手机号码
             */
            phone?: string;
            /**
             * 用户状态
             */
            status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
            /**
             * 用户角色
             */
            role: {
                /**
                 * 角色 ID
                 */
                id: string;
                /**
                 * 角色名称
                 */
                name: string;
                /**
                 * 角色描述
                 */
                description?: string;
                /**
                 * 是否为系统角色
                 */
                isSystem: boolean;
            };
            /**
             * 是否已设置密码（手机/微信自动注册用户可能未设置）
             */
            hasPassword: boolean;
            /**
             * 创建时间
             */
            createdAt: string; // date-time
            /**
             * 更新时间
             */
            updatedAt: string; // date-time
        }
        export interface UserRoleDto {
            /**
             * 角色 ID
             */
            id: string;
            /**
             * 角色名称
             */
            name: string;
            /**
             * 角色描述
             */
            description?: string;
            /**
             * 是否为系统角色
             */
            isSystem: boolean;
        }
        export interface UserSearchResultDto {
            /**
             * 用户 ID
             */
            id: string;
            /**
             * 用户邮箱
             */
            email: string;
            /**
             * 用户名
             */
            username: string;
            /**
             * 用户昵称
             */
            nickname?: string;
            /**
             * 头像 URL
             */
            avatar?: string;
        }
        /**
         * 用户状态
         */
        export type UserStatusEnum = "ACTIVE" | "INACTIVE" | "SUSPENDED";
        export interface VerifyBindEmailDto {
            /**
             * 邮箱地址
             * example:
             * user@example.com
             */
            email: string;
            /**
             * 验证码
             * example:
             * 123456
             */
            code: string;
        }
        export interface VerifyEmailDto {
            /**
             * 邮箱地址
             * example:
             * user@example.com
             */
            email: string;
            /**
             * 6位数字验证码
             * example:
             * 123456
             */
            code: string;
        }
        export interface WarmupHistoryDto {
            /**
             * 缓存键
             */
            key: string;
            /**
             * 最后预热时间
             */
            lastWarmup: string; // date-time
        }
        export interface WarmupResponseDto {
            /**
             * 是否成功
             */
            success: boolean;
            /**
             * 预热数量
             */
            count: number;
            /**
             * 耗时（毫秒）
             */
            duration?: number;
            /**
             * 错误信息
             */
            error?: string;
        }
        export interface WarmupStatsDto {
            /**
             * 预热配置
             */
            config: {
                /**
                 * 是否启用预热
                 */
                enabled: boolean;
                /**
                 * 预热时间（cron 表达式）
                 */
                schedule: string;
                /**
                 * 热点数据阈值（次/分钟）
                 */
                hotDataThreshold: number;
                /**
                 * 最大预热数据量
                 */
                maxWarmupSize: number;
                /**
                 * 预热数据类型
                 */
                dataTypes: string[];
            };
            /**
             * 已注册策略列表
             */
            strategies: string[];
            /**
             * 策略数量
             */
            strategyCount: number;
        }
    }
}
declare namespace Paths {
    namespace AdminControllerCleanupStorage {
        namespace Parameters {
            export type DelayDays = number;
        }
        export interface QueryParameters {
            delayDays?: Parameters.DelayDays;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AdminControllerGetAdminStats {
        namespace Responses {
            export type $200 = Components.Schemas.AdminStatsResponseDto;
        }
    }
    namespace AdminControllerGetCleanupStats {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuditLogControllerCleanupOldLogs {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuditLogControllerFindAll {
        namespace Parameters {
            export type Action = string;
            export type EndDate = string;
            /**
             * example:
             * 20
             */
            export type Limit = string;
            /**
             * example:
             * 1
             */
            export type Page = string;
            export type ResourceId = string;
            export type ResourceType = string;
            export type StartDate = string;
            export type Success = string;
            export type UserId = string;
        }
        export interface QueryParameters {
            userId?: Parameters.UserId;
            action?: Parameters.Action;
            resourceType?: Parameters.ResourceType;
            resourceId?: Parameters.ResourceId;
            startDate?: Parameters.StartDate;
            endDate?: Parameters.EndDate;
            success?: Parameters.Success;
            page?: /**
             * example:
             * 1
             */
            Parameters.Page;
            limit?: /**
             * example:
             * 20
             */
            Parameters.Limit;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuditLogControllerFindOne {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuditLogControllerGetStatistics {
        namespace Parameters {
            export type EndDate = string;
            export type StartDate = string;
            export type UserId = string;
        }
        export interface QueryParameters {
            startDate?: Parameters.StartDate;
            endDate?: Parameters.EndDate;
            userId?: Parameters.UserId;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuthControllerBindEmailAndLogin {
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerBindPhone {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "手机号绑定成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerBindPhoneAndLogin {
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerBindWechat {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "微信绑定成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerCheckFieldUniqueness {
        namespace Responses {
            /**
             * example:
             * {
             *   "usernameExists": false,
             *   "emailExists": false,
             *   "phoneExists": false
             * }
             */
            export type $200 = any;
        }
    }
    namespace AuthControllerForgotPassword {
        export type RequestBody = Components.Schemas.ForgotPasswordDto;
        namespace Responses {
            export type $200 = Components.Schemas.ForgotPasswordApiResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace AuthControllerGetProfile {
        namespace Responses {
            export type $200 = Components.Schemas.UserProfileResponseDto;
            export interface $401 {
            }
        }
    }
    namespace AuthControllerGetWechatAuthUrl {
        namespace Parameters {
            export type IsPopup = string;
            export type Origin = string;
            export type Purpose = string;
        }
        export interface QueryParameters {
            origin: Parameters.Origin;
            isPopup: Parameters.IsPopup;
            purpose: Parameters.Purpose;
        }
        namespace Responses {
            /**
             * example:
             * {
             *   "authUrl": "https://open.weixin.qq.com/connect/qrconnect?...",
             *   "state": "random_state_string"
             * }
             */
            export type $200 = any;
        }
    }
    namespace AuthControllerLogin {
        export type RequestBody = Components.Schemas.LoginDto;
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $401 {
            }
        }
    }
    namespace AuthControllerLoginByPhone {
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
            export interface $412 {
            }
        }
    }
    namespace AuthControllerLogout {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace AuthControllerRebindEmail {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "邮箱换绑成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerRebindPhone {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "手机号换绑成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerRefreshToken {
        export type RequestBody = Components.Schemas.RefreshTokenDto;
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $401 {
            }
        }
    }
    namespace AuthControllerRegister {
        export type RequestBody = Components.Schemas.RegisterDto;
        namespace Responses {
            export type $201 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerRegisterByPhone {
        namespace Responses {
            export type $201 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerResendVerification {
        namespace Responses {
            export type $200 = Components.Schemas.SendVerificationApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerResetPassword {
        export type RequestBody = Components.Schemas.ResetPasswordDto;
        namespace Responses {
            export type $200 = Components.Schemas.ResetPasswordApiResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace AuthControllerSendBindEmailCode {
        namespace Responses {
            export type $200 = Components.Schemas.BindEmailApiResponseDto;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerSendSmsCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "验证码已发送"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerSendUnbindEmailCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "验证码已发送到原邮箱"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerSendUnbindPhoneCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "验证码已发送到原手机号"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerSendVerification {
        namespace Responses {
            export type $200 = Components.Schemas.SendVerificationApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerUnbindWechat {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "微信解绑成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerVerifyBindEmail {
        export type RequestBody = Components.Schemas.VerifyBindEmailDto;
        namespace Responses {
            export type $200 = Components.Schemas.BindEmailApiResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerVerifyEmail {
        export type RequestBody = Components.Schemas.VerifyEmailDto;
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerVerifyEmailAndRegisterPhone {
        namespace Responses {
            export type $201 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace AuthControllerVerifyPhone {
        namespace Responses {
            export type $200 = Components.Schemas.AuthApiResponseDto;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerVerifySmsCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "valid": true,
             *   "message": "验证成功"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
        }
    }
    namespace AuthControllerVerifyUnbindEmailCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "验证通过",
             *   "token": "xxx"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace AuthControllerVerifyUnbindPhoneCode {
        namespace Responses {
            /**
             * example:
             * {
             *   "success": true,
             *   "message": "验证通过",
             *   "token": "xxx"
             * }
             */
            export type $200 = any;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace AuthControllerWechatCallback {
        namespace Responses {
            export interface $200 {
            }
            export interface $400 {
            }
        }
    }
    namespace CacheMonitorControllerCleanup {
        export type RequestBody = Components.Schemas.CacheCleanupDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerClearWarmupHistory {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerDeleteValue {
        namespace Parameters {
            export type Key = string;
        }
        export interface QueryParameters {
            key: Parameters.Key;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerDeleteValues {
        export type RequestBody = Components.Schemas.BatchCacheOperationDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetHealthStatus {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetHotData {
        namespace Parameters {
            export type Limit = string;
        }
        export interface QueryParameters {
            limit: Parameters.Limit;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetPerformanceMetrics {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetPerformanceTrend {
        namespace Parameters {
            export type Level = "L1" | "L2" | "L3";
            export type Minutes = number;
        }
        export interface QueryParameters {
            level: Parameters.Level;
            minutes?: Parameters.Minutes;
        }
        namespace Responses {
            export type $200 = Components.Schemas.PerformanceTrendDto;
        }
    }
    namespace CacheMonitorControllerGetSizeTrend {
        namespace Parameters {
            export type Minutes = string;
        }
        export interface QueryParameters {
            minutes: Parameters.Minutes;
        }
        namespace Responses {
            export type $200 = Components.Schemas.SizeTrendDto;
        }
    }
    namespace CacheMonitorControllerGetSummary {
        namespace Responses {
            export type $200 = Components.Schemas.CacheMonitoringSummaryDto;
        }
    }
    namespace CacheMonitorControllerGetValue {
        namespace Parameters {
            export type Key = string;
        }
        export interface QueryParameters {
            key: Parameters.Key;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetWarmupConfig {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerGetWarmupHistory {
        namespace Responses {
            export type $200 = Components.Schemas.WarmupHistoryDto[];
        }
    }
    namespace CacheMonitorControllerGetWarmupStats {
        namespace Responses {
            export type $200 = Components.Schemas.WarmupStatsDto;
        }
    }
    namespace CacheMonitorControllerGetWarnings {
        namespace Responses {
            export type $200 = Components.Schemas.CacheWarningsDto;
        }
    }
    namespace CacheMonitorControllerRefresh {
        export type RequestBody = Components.Schemas.CacheRefreshDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace CacheMonitorControllerTriggerWarmup {
        export type RequestBody = Components.Schemas.TriggerWarmupDto;
        namespace Responses {
            export type $200 = Components.Schemas.WarmupResponseDto;
        }
    }
    namespace CacheMonitorControllerUpdateWarmupConfig {
        export type RequestBody = Components.Schemas.UpdateWarmupConfigDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FileSystemControllerAddProjectMember {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export type $201 = Components.Schemas.ProjectMemberDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerCheckProjectPermission {
        namespace Parameters {
            export type Permission = /* 权限名称 */ Components.Schemas.ProjectPermissionEnum;
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        export interface QueryParameters {
            permission: Parameters.Permission;
        }
        namespace Responses {
            export type $200 = Components.Schemas.PermissionCheckResponseDto;
        }
    }
    namespace FileSystemControllerClearTrash {
        namespace Responses {
            export type $200 = Components.Schemas.OperationSuccessDto;
        }
    }
    namespace FileSystemControllerCopyNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $201 = Components.Schemas.FileSystemNodeDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerCreateFolder {
        namespace Parameters {
            export type ParentId = string;
        }
        export interface PathParameters {
            parentId: Parameters.ParentId;
        }
        namespace Responses {
            export type $201 = Components.Schemas.FileSystemNodeDto;
            export interface $400 {
            }
        }
    }
    namespace FileSystemControllerCreateNode {
        namespace Responses {
            export type $201 = Components.Schemas.FileSystemNodeDto;
            export interface $400 {
            }
        }
    }
    namespace FileSystemControllerCreateProject {
        namespace Responses {
            export type $201 = Components.Schemas.ProjectDto;
            export interface $400 {
            }
            export interface $403 {
            }
        }
    }
    namespace FileSystemControllerDeleteNode {
        namespace Parameters {
            export type NodeId = string;
            export type Permanently = boolean;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            permanently: Parameters.Permanently;
        }
        namespace Responses {
            export type $200 = Components.Schemas.OperationSuccessDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerDownloadNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerDownloadNodeOptions {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FileSystemControllerDownloadNodeWithFormat {
        namespace Parameters {
            export type ColorPolicy = any;
            export type Format = Components.Schemas.CadDownloadFormat;
            export type Height = any;
            export type NodeId = string;
            export type Width = any;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            colorPolicy?: Parameters.ColorPolicy;
            height?: Parameters.Height;
            width?: Parameters.Width;
            format?: Parameters.Format;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetChildren {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeTreeResponseDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetPersonalSpace {
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
        }
    }
    namespace FileSystemControllerGetProject {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ProjectDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetProjectMembers {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ProjectMemberDto[];
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetProjects {
        namespace Responses {
            export type $200 = Components.Schemas.ProjectListResponseDto;
        }
    }
    namespace FileSystemControllerGetRootNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetStorageQuota {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface QueryParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.StorageInfoDto;
        }
    }
    namespace FileSystemControllerGetThumbnail {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $204 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerGetTrash {
        namespace Responses {
            export type $200 = Components.Schemas.TrashListResponseDto;
        }
    }
    namespace FileSystemControllerGetUserProjectPermissions {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ProjectUserPermissionsDto;
        }
    }
    namespace FileSystemControllerGetUserProjectRole {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FileSystemControllerMoveNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerPermanentlyDeleteTrashItems {
        namespace Responses {
            export type $200 = Components.Schemas.BatchOperationResponseDto;
        }
    }
    namespace FileSystemControllerRemoveProjectMember {
        namespace Parameters {
            export type ProjectId = string;
            export type UserId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
            userId: Parameters.UserId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.OperationSuccessDto;
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerRestoreNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerRestoreTrashItems {
        namespace Responses {
            export type $200 = Components.Schemas.BatchOperationResponseDto;
        }
    }
    namespace FileSystemControllerSearch {
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
            export interface $400 {
            }
        }
    }
    namespace FileSystemControllerUpdateNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerUpdateProjectMember {
        namespace Parameters {
            export type ProjectId = string;
            export type UserId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
            userId: Parameters.UserId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ProjectMemberDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FileSystemControllerUpdateStorageQuota {
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace FontsControllerDeleteFont {
        namespace Parameters {
            export type FileName = string;
            export type Target = /* 上传目标 */ Components.Schemas.FontUploadTarget;
        }
        export interface PathParameters {
            fileName: Parameters.FileName;
        }
        export interface QueryParameters {
            target?: Parameters.Target;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FontsControllerDownloadFont {
        namespace Parameters {
            export type FileName = string;
            export type Location = "backend" | "frontend";
        }
        export interface PathParameters {
            fileName: Parameters.FileName;
        }
        export interface QueryParameters {
            location: Parameters.Location;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FontsControllerGetFonts {
        namespace Parameters {
            export type Location = "backend" | "frontend";
        }
        export interface QueryParameters {
            location?: Parameters.Location;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace FontsControllerUploadFont {
        export type RequestBody = Components.Schemas.UploadFontDto;
        namespace Responses {
            export interface $201 {
            }
        }
    }
    namespace HealthControllerCheck {
        namespace Responses {
            export interface $200 {
                /**
                 * example:
                 * ok
                 */
                status?: string;
                /**
                 * example:
                 * {
                 *   "database": {
                 *     "status": "up"
                 *   }
                 * }
                 */
                info?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                } | null;
                /**
                 * example:
                 * {}
                 */
                error?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                } | null;
                /**
                 * example:
                 * {
                 *   "database": {
                 *     "status": "up"
                 *   }
                 * }
                 */
                details?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                };
            }
            export interface $503 {
                /**
                 * example:
                 * error
                 */
                status?: string;
                /**
                 * example:
                 * {
                 *   "database": {
                 *     "status": "up"
                 *   }
                 * }
                 */
                info?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                } | null;
                /**
                 * example:
                 * {
                 *   "redis": {
                 *     "status": "down",
                 *     "message": "Could not connect"
                 *   }
                 * }
                 */
                error?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                } | null;
                /**
                 * example:
                 * {
                 *   "database": {
                 *     "status": "up"
                 *   },
                 *   "redis": {
                 *     "status": "down",
                 *     "message": "Could not connect"
                 *   }
                 * }
                 */
                details?: {
                    [name: string]: {
                        [name: string]: any;
                        status: string;
                    };
                };
            }
        }
    }
    namespace HealthControllerCheckDatabase {
        namespace Responses {
            export interface $200 {
            }
            export interface $503 {
            }
        }
    }
    namespace HealthControllerCheckStorage {
        namespace Responses {
            export interface $200 {
            }
            export interface $503 {
            }
        }
    }
    namespace HealthControllerLiveness {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace HealthControllerPublicHealth {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace LibraryControllerDownloadBlockNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileContentResponseDto;
        }
    }
    namespace LibraryControllerDownloadDrawingNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileContentResponseDto;
        }
    }
    namespace LibraryControllerGetBlockAllFiles {
        namespace Parameters {
            /**
             * example:
             * .dwg
             */
            export type Extension = string;
            export type FileStatus = Components.Schemas.FileStatus;
            export type IncludeDeleted = boolean;
            export type Limit = number;
            export type NodeId = string;
            export type NodeType = "folder" | "file";
            export type Page = number;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            nodeType?: Parameters.NodeType;
            extension?: /**
             * example:
             * .dwg
             */
            Parameters.Extension;
            fileStatus?: Parameters.FileStatus;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            includeDeleted?: Parameters.IncludeDeleted;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
        }
    }
    namespace LibraryControllerGetBlockChildren {
        namespace Parameters {
            /**
             * example:
             * .dwg
             */
            export type Extension = string;
            export type FileStatus = Components.Schemas.FileStatus;
            export type IncludeDeleted = boolean;
            export type Limit = number;
            export type NodeId = string;
            export type NodeType = "folder" | "file";
            export type Page = number;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            nodeType?: Parameters.NodeType;
            extension?: /**
             * example:
             * .dwg
             */
            Parameters.Extension;
            fileStatus?: Parameters.FileStatus;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            includeDeleted?: Parameters.IncludeDeleted;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
        }
    }
    namespace LibraryControllerGetBlockFile {
        namespace Parameters {
            export type Path = string[];
        }
        export interface PathParameters {
            path: Parameters.Path;
        }
    }
    namespace LibraryControllerGetBlockLibrary {
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
        }
    }
    namespace LibraryControllerGetBlockNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
        }
    }
    namespace LibraryControllerGetBlockThumbnail {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace LibraryControllerGetDrawingAllFiles {
        namespace Parameters {
            /**
             * example:
             * .dwg
             */
            export type Extension = string;
            export type FileStatus = Components.Schemas.FileStatus;
            export type IncludeDeleted = boolean;
            export type Limit = number;
            export type NodeId = string;
            export type NodeType = "folder" | "file";
            export type Page = number;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            nodeType?: Parameters.NodeType;
            extension?: /**
             * example:
             * .dwg
             */
            Parameters.Extension;
            fileStatus?: Parameters.FileStatus;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            includeDeleted?: Parameters.IncludeDeleted;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
        }
    }
    namespace LibraryControllerGetDrawingChildren {
        namespace Parameters {
            /**
             * example:
             * .dwg
             */
            export type Extension = string;
            export type FileStatus = Components.Schemas.FileStatus;
            export type IncludeDeleted = boolean;
            export type Limit = number;
            export type NodeId = string;
            export type NodeType = "folder" | "file";
            export type Page = number;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            nodeType?: Parameters.NodeType;
            extension?: /**
             * example:
             * .dwg
             */
            Parameters.Extension;
            fileStatus?: Parameters.FileStatus;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            includeDeleted?: Parameters.IncludeDeleted;
        }
        namespace Responses {
            export type $200 = Components.Schemas.NodeListResponseDto;
        }
    }
    namespace LibraryControllerGetDrawingFile {
        namespace Parameters {
            export type Path = string[];
        }
        export interface PathParameters {
            path: Parameters.Path;
        }
    }
    namespace LibraryControllerGetDrawingLibrary {
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
        }
    }
    namespace LibraryControllerGetDrawingNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileSystemNodeDto;
        }
    }
    namespace LibraryControllerGetDrawingThumbnail {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace MxCadControllerCheckChunkExist {
        export type RequestBody = Components.Schemas.CheckChunkExistDto;
        namespace Responses {
            export type $200 = Components.Schemas.ChunkExistResponseDto;
        }
    }
    namespace MxCadControllerCheckDuplicateFile {
        export type RequestBody = Components.Schemas.CheckDuplicateFileDto;
        namespace Responses {
            export type $200 = Components.Schemas.CheckDuplicateFileResponseDto;
        }
    }
    namespace MxCadControllerCheckExternalReference {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.CheckReferenceResponseDto;
            export interface $400 {
                /**
                 * example:
                 * -1
                 */
                code?: number;
                /**
                 * example:
                 * 缺少必要参数
                 */
                message?: string;
            }
        }
    }
    namespace MxCadControllerCheckFileExist {
        export type RequestBody = Components.Schemas.CheckFileExistDto;
        namespace Responses {
            export type $200 = Components.Schemas.FileExistResponseDto;
        }
    }
    namespace MxCadControllerCheckThumbnail {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.CheckThumbnailResponseDto;
            export interface $400 {
            }
            export interface $404 {
            }
        }
    }
    namespace MxCadControllerGetFile {
        namespace Responses {
            export type $200 = string; // binary
            export interface $404 {
                /**
                 * example:
                 * -1
                 */
                code?: number;
                /**
                 * example:
                 * 文件不存在
                 */
                message?: string;
            }
            export interface $500 {
                /**
                 * example:
                 * -1
                 */
                code?: number;
                /**
                 * example:
                 * 获取文件失败
                 */
                message?: string;
            }
        }
    }
    namespace MxCadControllerGetFileHead {
        namespace Responses {
            export interface $200 {
            }
            export interface $404 {
            }
            export interface $500 {
            }
        }
    }
    namespace MxCadControllerGetFilesDataFile {
        namespace Responses {
            export type $200 = string; // binary
            export interface $401 {
            }
            export interface $404 {
                /**
                 * example:
                 * -1
                 */
                code?: number;
                /**
                 * example:
                 * 文件不存在
                 */
                message?: string;
            }
            export interface $500 {
                /**
                 * example:
                 * -1
                 */
                code?: number;
                /**
                 * example:
                 * 获取文件失败
                 */
                message?: string;
            }
        }
    }
    namespace MxCadControllerGetFilesDataFileHead {
        namespace Responses {
            export interface $200 {
            }
            export interface $404 {
            }
            export interface $500 {
            }
        }
    }
    namespace MxCadControllerGetNonCadFile {
        namespace Parameters {
            export type StorageKey = string;
        }
        export interface PathParameters {
            storageKey: Parameters.StorageKey;
        }
        namespace Responses {
            export type $200 = string; // binary
            export interface $404 {
            }
            export interface $500 {
            }
        }
    }
    namespace MxCadControllerGetPreloadingData {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.PreloadingDataDto;
            export interface $404 {
            }
        }
    }
    namespace MxCadControllerRefreshExternalReferences {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RefreshExternalReferencesResponseDto;
            export interface $500 {
            }
        }
    }
    namespace MxCadControllerSaveMxwebAs {
        export type RequestBody = Components.Schemas.SaveMxwebAsDto;
        namespace Responses {
            export type $200 = Components.Schemas.SaveMxwebAsResponseDto;
            export interface $400 {
            }
        }
    }
    namespace MxCadControllerSaveMxwebToNode {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export type RequestBody = Components.Schemas.SaveMxwebDto;
        namespace Responses {
            export type $200 = Components.Schemas.SaveMxwebResponseDto;
        }
    }
    namespace MxCadControllerUploadExtReferenceDwg {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export type RequestBody = Components.Schemas.UploadExtReferenceFileDto;
        namespace Responses {
            export interface $200 {
                /**
                 * example:
                 * 0
                 */
                code?: number;
                /**
                 * example:
                 * ok
                 */
                message?: string;
            }
            export interface $400 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace MxCadControllerUploadExtReferenceImage {
        export type RequestBody = Components.Schemas.UploadExtReferenceFileDto;
        namespace Responses {
            export interface $200 {
                /**
                 * example:
                 * 0
                 */
                code?: number;
                /**
                 * example:
                 * ok
                 */
                message?: string;
            }
            export interface $400 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace MxCadControllerUploadFile {
        export type RequestBody = Components.Schemas.UploadFilesDto;
        namespace Responses {
            export type $200 = Components.Schemas.UploadFileResponseDto;
        }
    }
    namespace MxCadControllerUploadThumbnail {
        namespace Parameters {
            export type NodeId = string;
        }
        export interface PathParameters {
            nodeId: Parameters.NodeId;
        }
        export type RequestBody = Components.Schemas.UploadThumbnailDto;
        namespace Responses {
            export type $200 = Components.Schemas.UploadThumbnailResponseDto;
            export interface $400 {
            }
            export interface $500 {
            }
        }
    }
    namespace PublicFileControllerAccessFile {
        namespace Parameters {
            export type Filename = string;
            export type Hash = string;
        }
        export interface PathParameters {
            hash: Parameters.Hash;
            filename: Parameters.Filename;
        }
        namespace Responses {
            export interface $404 {
            }
        }
    }
    namespace PublicFileControllerCheckChunk {
        export type RequestBody = Components.Schemas.CheckChunkDto;
        namespace Responses {
            export type $200 = Components.Schemas.CheckChunkResponseDto;
        }
    }
    namespace PublicFileControllerCheckExtReference {
        namespace Parameters {
            export type FileName = string;
            export type SrcHash = string;
        }
        export interface QueryParameters {
            srcHash: Parameters.SrcHash;
            fileName: Parameters.FileName;
        }
        namespace Responses {
            export interface $200 {
                exists?: boolean;
            }
        }
    }
    namespace PublicFileControllerCheckFile {
        export type RequestBody = Components.Schemas.CheckFileDto;
        namespace Responses {
            export type $200 = Components.Schemas.CheckFileResponseDto;
        }
    }
    namespace PublicFileControllerGetPreloadingData {
        namespace Parameters {
            export type Hash = string;
        }
        export interface PathParameters {
            hash: Parameters.Hash;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $404 {
            }
        }
    }
    namespace PublicFileControllerMergeChunks {
        export type RequestBody = Components.Schemas.MergeChunksDto;
        namespace Responses {
            export type $200 = Components.Schemas.MergeCompleteResponseDto;
        }
    }
    namespace PublicFileControllerUploadChunk {
        export type RequestBody = Components.Schemas.UploadChunkDto;
        namespace Responses {
            export type $200 = Components.Schemas.UploadChunkResponseDto;
        }
    }
    namespace PublicFileControllerUploadExtReference {
        export type RequestBody = Components.Schemas.UploadExtReferenceDto;
        namespace Responses {
            export interface $200 {
                /**
                 * example:
                 * ok
                 */
                ret?: string;
                hash?: string;
                message?: string;
            }
            export interface $400 {
            }
        }
    }
    namespace RolesControllerAddPermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RoleDto;
        }
    }
    namespace RolesControllerAddProjectRolePermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.PermissionsDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace RolesControllerCreate {
        export type RequestBody = Components.Schemas.CreateRoleDto;
        namespace Responses {
            export type $201 = Components.Schemas.RoleDto;
        }
    }
    namespace RolesControllerCreateProjectRole {
        export type RequestBody = Components.Schemas.CreateProjectRoleDto;
        namespace Responses {
            export type $201 = Components.Schemas.ProjectRoleDto;
        }
    }
    namespace RolesControllerDeleteProjectRole {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace RolesControllerFindAll {
        namespace Responses {
            export type $200 = Components.Schemas.RoleDto[];
        }
    }
    namespace RolesControllerFindOne {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RoleDto;
        }
    }
    namespace RolesControllerGetAllProjectRoles {
        namespace Responses {
            export type $200 = Components.Schemas.ProjectRoleDto[];
        }
    }
    namespace RolesControllerGetProjectRolePermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = string[];
        }
    }
    namespace RolesControllerGetProjectRolesByProject {
        namespace Parameters {
            export type ProjectId = string;
        }
        export interface PathParameters {
            projectId: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ProjectRoleDto[];
        }
    }
    namespace RolesControllerGetRolePermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = string[];
        }
    }
    namespace RolesControllerGetSystemProjectRoles {
        namespace Responses {
            export type $200 = Components.Schemas.ProjectRoleDto[];
        }
    }
    namespace RolesControllerRemove {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace RolesControllerRemovePermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RoleDto;
        }
    }
    namespace RolesControllerRemoveProjectRolePermissions {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.PermissionsDto;
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace RolesControllerUpdate {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.UpdateRoleDto;
        namespace Responses {
            export type $200 = Components.Schemas.RoleDto;
        }
    }
    namespace RolesControllerUpdateProjectRole {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.UpdateProjectRoleDto;
        namespace Responses {
            export type $200 = Components.Schemas.ProjectRoleDto;
        }
    }
    namespace RuntimeConfigControllerGetAllConfigs {
        namespace Responses {
            export type $200 = Components.Schemas.RuntimeConfigResponseDto[];
        }
    }
    namespace RuntimeConfigControllerGetConfig {
        namespace Parameters {
            export type Key = string;
        }
        export interface PathParameters {
            key: Parameters.Key;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RuntimeConfigResponseDto;
        }
    }
    namespace RuntimeConfigControllerGetDefinitions {
        namespace Responses {
            export type $200 = Components.Schemas.RuntimeConfigDefinitionDto[];
        }
    }
    namespace RuntimeConfigControllerGetPublicConfigs {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace RuntimeConfigControllerResetConfig {
        namespace Parameters {
            export type Key = string;
        }
        export interface PathParameters {
            key: Parameters.Key;
        }
        namespace Responses {
            export interface $201 {
                /**
                 * example:
                 * true
                 */
                success?: boolean;
            }
        }
    }
    namespace RuntimeConfigControllerUpdateConfig {
        namespace Parameters {
            export type Key = string;
        }
        export interface PathParameters {
            key: Parameters.Key;
        }
        export type RequestBody = Components.Schemas.UpdateRuntimeConfigDto;
        namespace Responses {
            export interface $200 {
                /**
                 * example:
                 * true
                 */
                success?: boolean;
            }
        }
    }
    namespace UserCleanupControllerGetStats {
        namespace Responses {
            export type $200 = Components.Schemas.UserCleanupStatsResponseDto;
        }
    }
    namespace UserCleanupControllerTriggerCleanup {
        export type RequestBody = Components.Schemas.UserCleanupTriggerDto;
        namespace Responses {
            export type $200 = Components.Schemas.UserCleanupTriggerResponseDto;
        }
    }
    namespace UsersControllerChangePassword {
        export type RequestBody = Components.Schemas.ChangePasswordDto;
        namespace Responses {
            export type $200 = Components.Schemas.ChangePasswordApiResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $409 {
            }
        }
    }
    namespace UsersControllerCreate {
        export type RequestBody = Components.Schemas.CreateUserDto;
        namespace Responses {
            export type $201 = Components.Schemas.UserResponseDto;
            export interface $400 {
            }
            export interface $409 {
            }
        }
    }
    namespace UsersControllerDeactivateAccount {
        export type RequestBody = Components.Schemas.DeactivateAccountDto;
        namespace Responses {
            export type $200 = Components.Schemas.DeactivateAccountApiResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace UsersControllerDeleteImmediately {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $403 {
            }
            export interface $404 {
            }
        }
    }
    namespace UsersControllerFindAll {
        namespace Parameters {
            export type Limit = number;
            export type Page = number;
            export type ProjectId = string;
            export type RoleId = string;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
            export type Status = string;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            status?: Parameters.Status;
            roleId?: Parameters.RoleId;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            projectId?: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.UserListResponseDto;
        }
    }
    namespace UsersControllerFindOne {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = Components.Schemas.UserResponseDto;
            export interface $404 {
            }
        }
    }
    namespace UsersControllerGetDashboardStats {
        namespace Responses {
            export type $200 = Components.Schemas.UserDashboardStatsDto;
        }
    }
    namespace UsersControllerGetProfile {
        namespace Responses {
            export type $200 = Components.Schemas.UserProfileResponseDto;
        }
    }
    namespace UsersControllerRemove {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $404 {
            }
        }
    }
    namespace UsersControllerRestore {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export interface $200 {
            }
            export interface $404 {
            }
        }
    }
    namespace UsersControllerRestoreAccount {
        export type RequestBody = Components.Schemas.RestoreAccountDto;
        namespace Responses {
            export type $200 = Components.Schemas.RestoreAccountResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
        }
    }
    namespace UsersControllerSearchByEmail {
        namespace Parameters {
            export type Email = string;
        }
        export interface QueryParameters {
            email: Parameters.Email;
        }
        namespace Responses {
            export type $200 = Components.Schemas.UserSearchResultDto;
            export interface $404 {
            }
        }
    }
    namespace UsersControllerSearchUsers {
        namespace Parameters {
            export type Limit = number;
            export type Page = number;
            export type ProjectId = string;
            export type RoleId = string;
            export type Search = string;
            export type SortBy = string;
            export type SortOrder = "asc" | "desc";
            export type Status = string;
        }
        export interface QueryParameters {
            search?: Parameters.Search;
            status?: Parameters.Status;
            roleId?: Parameters.RoleId;
            page?: Parameters.Page;
            limit?: Parameters.Limit;
            sortBy?: Parameters.SortBy;
            sortOrder?: Parameters.SortOrder;
            projectId?: Parameters.ProjectId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.UserListResponseDto;
        }
    }
    namespace UsersControllerUpdate {
        namespace Parameters {
            export type Id = string;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.UpdateUserDto;
        namespace Responses {
            export type $200 = Components.Schemas.UserResponseDto;
            export interface $404 {
            }
        }
    }
    namespace UsersControllerUpdateProfile {
        export type RequestBody = Components.Schemas.UpdateUserDto;
        namespace Responses {
            export type $200 = Components.Schemas.UserProfileResponseDto;
            export interface $400 {
            }
        }
    }
    namespace VersionControlControllerGetFileContentAtRevision {
        namespace Parameters {
            export type FilePath = string;
            export type ProjectId = string;
            export type Revision = number;
        }
        export interface PathParameters {
            revision: Parameters.Revision;
        }
        export interface QueryParameters {
            projectId: Parameters.ProjectId;
            filePath: Parameters.FilePath;
        }
        namespace Responses {
            export type $200 = Components.Schemas.FileContentResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
        }
    }
    namespace VersionControlControllerGetFileHistory {
        namespace Parameters {
            export type FilePath = string;
            export type Limit = number;
            export type ProjectId = string;
        }
        export interface QueryParameters {
            projectId: Parameters.ProjectId;
            filePath: Parameters.FilePath;
            limit?: Parameters.Limit;
        }
        namespace Responses {
            export type $200 = Components.Schemas.SvnLogResponseDto;
            export interface $400 {
            }
            export interface $401 {
            }
            export interface $403 {
            }
        }
    }
}


export interface OperationMethods {
  /**
   * CacheMonitorController_getSummary - 获取缓存监控摘要
   */
  'CacheMonitorController_getSummary'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetSummary.Responses.$200>
  /**
   * CacheMonitorController_getHealthStatus - 获取缓存健康状态
   */
  'CacheMonitorController_getHealthStatus'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetHealthStatus.Responses.$200>
  /**
   * CacheMonitorController_getPerformanceMetrics - 获取缓存性能指标
   */
  'CacheMonitorController_getPerformanceMetrics'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetPerformanceMetrics.Responses.$200>
  /**
   * CacheMonitorController_getHotData - 获取热点数据
   */
  'CacheMonitorController_getHotData'(
    parameters?: Parameters<Paths.CacheMonitorControllerGetHotData.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetHotData.Responses.$200>
  /**
   * CacheMonitorController_getPerformanceTrend - 获取性能趋势
   */
  'CacheMonitorController_getPerformanceTrend'(
    parameters?: Parameters<Paths.CacheMonitorControllerGetPerformanceTrend.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetPerformanceTrend.Responses.$200>
  /**
   * CacheMonitorController_getSizeTrend - 获取缓存大小趋势
   */
  'CacheMonitorController_getSizeTrend'(
    parameters?: Parameters<Paths.CacheMonitorControllerGetSizeTrend.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetSizeTrend.Responses.$200>
  /**
   * CacheMonitorController_getWarnings - 获取缓存警告
   */
  'CacheMonitorController_getWarnings'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetWarnings.Responses.$200>
  /**
   * CacheMonitorController_getValue - 获取缓存值
   */
  'CacheMonitorController_getValue'(
    parameters?: Parameters<Paths.CacheMonitorControllerGetValue.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetValue.Responses.$200>
  /**
   * CacheMonitorController_deleteValue - 删除缓存
   */
  'CacheMonitorController_deleteValue'(
    parameters?: Parameters<Paths.CacheMonitorControllerDeleteValue.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerDeleteValue.Responses.$200>
  /**
   * CacheMonitorController_deleteValues - 批量删除缓存
   */
  'CacheMonitorController_deleteValues'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CacheMonitorControllerDeleteValues.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerDeleteValues.Responses.$200>
  /**
   * CacheMonitorController_refresh - 刷新缓存
   */
  'CacheMonitorController_refresh'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CacheMonitorControllerRefresh.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerRefresh.Responses.$200>
  /**
   * CacheMonitorController_cleanup - 清理缓存
   */
  'CacheMonitorController_cleanup'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CacheMonitorControllerCleanup.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerCleanup.Responses.$200>
  /**
   * CacheMonitorController_getWarmupConfig - 获取预热配置
   */
  'CacheMonitorController_getWarmupConfig'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetWarmupConfig.Responses.$200>
  /**
   * CacheMonitorController_updateWarmupConfig - 更新预热配置
   */
  'CacheMonitorController_updateWarmupConfig'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CacheMonitorControllerUpdateWarmupConfig.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerUpdateWarmupConfig.Responses.$200>
  /**
   * CacheMonitorController_triggerWarmup - 触发预热
   */
  'CacheMonitorController_triggerWarmup'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CacheMonitorControllerTriggerWarmup.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerTriggerWarmup.Responses.$200>
  /**
   * CacheMonitorController_getWarmupHistory - 获取预热历史
   */
  'CacheMonitorController_getWarmupHistory'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetWarmupHistory.Responses.$200>
  /**
   * CacheMonitorController_clearWarmupHistory - 清除预热历史
   */
  'CacheMonitorController_clearWarmupHistory'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerClearWarmupHistory.Responses.$200>
  /**
   * CacheMonitorController_getWarmupStats - 获取预热统计
   */
  'CacheMonitorController_getWarmupStats'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.CacheMonitorControllerGetWarmupStats.Responses.$200>
  /**
   * AuthController_register - 用户注册
   */
  'AuthController_register'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerRegister.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerRegister.Responses.$201>
  /**
   * AuthController_login - 用户登录
   */
  'AuthController_login'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerLogin.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerLogin.Responses.$200>
  /**
   * AuthController_refreshToken - 刷新Token
   */
  'AuthController_refreshToken'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerRefreshToken.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerRefreshToken.Responses.$200>
  /**
   * AuthController_logout - 用户登出
   */
  'AuthController_logout'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerLogout.Responses.$200>
  /**
   * AuthController_getProfile - 获取用户信息
   */
  'AuthController_getProfile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerGetProfile.Responses.$200>
  /**
   * AuthController_sendVerification - 发送邮箱验证码
   */
  'AuthController_sendVerification'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerSendVerification.Responses.$200>
  /**
   * AuthController_verifyEmail - 验证邮箱
   */
  'AuthController_verifyEmail'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerVerifyEmail.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyEmail.Responses.$200>
  /**
   * AuthController_verifyEmailAndRegisterPhone - 验证邮箱并完成手机号注册
   */
  'AuthController_verifyEmailAndRegisterPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyEmailAndRegisterPhone.Responses.$201>
  /**
   * AuthController_resendVerification - 重发验证码
   */
  'AuthController_resendVerification'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerResendVerification.Responses.$200>
  /**
   * AuthController_bindEmailAndLogin - 绑定邮箱并登录（用于已注册但没有邮箱的用户）
   */
  'AuthController_bindEmailAndLogin'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerBindEmailAndLogin.Responses.$200>
  /**
   * AuthController_bindPhoneAndLogin - 绑定手机号并登录（用于已注册但没有手机号的用户）
   */
  'AuthController_bindPhoneAndLogin'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerBindPhoneAndLogin.Responses.$200>
  /**
   * AuthController_verifyPhone - 验证手机号（用于已注册但手机号未验证的用户）
   */
  'AuthController_verifyPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyPhone.Responses.$200>
  /**
   * AuthController_forgotPassword - 忘记密码
   */
  'AuthController_forgotPassword'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerForgotPassword.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerForgotPassword.Responses.$200>
  /**
   * AuthController_resetPassword - 重置密码
   */
  'AuthController_resetPassword'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerResetPassword.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerResetPassword.Responses.$200>
  /**
   * AuthController_sendBindEmailCode - 发送绑定邮箱验证码
   */
  'AuthController_sendBindEmailCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerSendBindEmailCode.Responses.$200>
  /**
   * AuthController_verifyBindEmail - 验证并绑定邮箱
   */
  'AuthController_verifyBindEmail'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthControllerVerifyBindEmail.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyBindEmail.Responses.$200>
  /**
   * AuthController_sendUnbindEmailCode - 发送解绑邮箱验证码（验证原邮箱）
   */
  'AuthController_sendUnbindEmailCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerSendUnbindEmailCode.Responses.$200>
  /**
   * AuthController_verifyUnbindEmailCode - 验证解绑邮箱验证码
   */
  'AuthController_verifyUnbindEmailCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyUnbindEmailCode.Responses.$200>
  /**
   * AuthController_rebindEmail - 换绑邮箱（需要先验证原邮箱）
   */
  'AuthController_rebindEmail'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerRebindEmail.Responses.$200>
  /**
   * AuthController_sendSmsCode - 发送短信验证码
   */
  'AuthController_sendSmsCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerSendSmsCode.Responses.$200>
  /**
   * AuthController_verifySmsCode - 验证短信验证码
   */
  'AuthController_verifySmsCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifySmsCode.Responses.$200>
  /**
   * AuthController_registerByPhone - 手机号注册
   */
  'AuthController_registerByPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerRegisterByPhone.Responses.$201>
  /**
   * AuthController_loginByPhone - 手机号验证码登录
   */
  'AuthController_loginByPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerLoginByPhone.Responses.$200>
  /**
   * AuthController_bindPhone - 绑定手机号
   */
  'AuthController_bindPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerBindPhone.Responses.$200>
  /**
   * AuthController_sendUnbindPhoneCode - 发送解绑手机号验证码（验证原手机号）
   */
  'AuthController_sendUnbindPhoneCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerSendUnbindPhoneCode.Responses.$200>
  /**
   * AuthController_verifyUnbindPhoneCode - 验证解绑手机号验证码
   */
  'AuthController_verifyUnbindPhoneCode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerVerifyUnbindPhoneCode.Responses.$200>
  /**
   * AuthController_rebindPhone - 换绑手机号（需要先验证原手机号）
   */
  'AuthController_rebindPhone'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerRebindPhone.Responses.$200>
  /**
   * AuthController_checkFieldUniqueness - 检查字段唯一性（用户名、邮箱、手机号）
   */
  'AuthController_checkFieldUniqueness'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerCheckFieldUniqueness.Responses.$200>
  /**
   * AuthController_getWechatAuthUrl - 获取微信授权 URL
   */
  'AuthController_getWechatAuthUrl'(
    parameters?: Parameters<Paths.AuthControllerGetWechatAuthUrl.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerGetWechatAuthUrl.Responses.$200>
  /**
   * AuthController_wechatCallback - 微信授权回调
   */
  'AuthController_wechatCallback'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerWechatCallback.Responses.$200>
  /**
   * AuthController_bindWechat - 绑定微信到当前账号
   */
  'AuthController_bindWechat'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerBindWechat.Responses.$200>
  /**
   * AuthController_unbindWechat - 解绑微信
   */
  'AuthController_unbindWechat'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuthControllerUnbindWechat.Responses.$200>
  /**
   * UserCleanupController_getStats - 获取待清理用户统计
   */
  'UserCleanupController_getStats'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UserCleanupControllerGetStats.Responses.$200>
  /**
   * UserCleanupController_triggerCleanup - 手动触发用户数据清理
   */
  'UserCleanupController_triggerCleanup'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UserCleanupControllerTriggerCleanup.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UserCleanupControllerTriggerCleanup.Responses.$200>
  /**
   * RuntimeConfigController_getPublicConfigs - 获取公开配置（前端初始化使用）
   */
  'RuntimeConfigController_getPublicConfigs'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerGetPublicConfigs.Responses.$200>
  /**
   * RuntimeConfigController_getAllConfigs - 获取所有运行时配置
   */
  'RuntimeConfigController_getAllConfigs'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerGetAllConfigs.Responses.$200>
  /**
   * RuntimeConfigController_getDefinitions - 获取配置项定义
   */
  'RuntimeConfigController_getDefinitions'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerGetDefinitions.Responses.$200>
  /**
   * RuntimeConfigController_getConfig - 获取单个配置项
   */
  'RuntimeConfigController_getConfig'(
    parameters?: Parameters<Paths.RuntimeConfigControllerGetConfig.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerGetConfig.Responses.$200>
  /**
   * RuntimeConfigController_updateConfig - 更新配置项
   */
  'RuntimeConfigController_updateConfig'(
    parameters?: Parameters<Paths.RuntimeConfigControllerUpdateConfig.PathParameters> | null,
    data?: Paths.RuntimeConfigControllerUpdateConfig.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerUpdateConfig.Responses.$200>
  /**
   * RuntimeConfigController_resetConfig - 重置配置为默认值
   */
  'RuntimeConfigController_resetConfig'(
    parameters?: Parameters<Paths.RuntimeConfigControllerResetConfig.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RuntimeConfigControllerResetConfig.Responses.$201>
  /**
   * UsersController_findAll - 获取用户列表
   */
  'UsersController_findAll'(
    parameters?: Parameters<Paths.UsersControllerFindAll.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerFindAll.Responses.$200>
  /**
   * UsersController_create - 创建用户
   */
  'UsersController_create'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UsersControllerCreate.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerCreate.Responses.$201>
  /**
   * UsersController_searchByEmail - 根据邮箱搜索用户
   */
  'UsersController_searchByEmail'(
    parameters?: Parameters<Paths.UsersControllerSearchByEmail.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerSearchByEmail.Responses.$200>
  /**
   * UsersController_searchUsers - 搜索用户（用于添加项目成员）
   */
  'UsersController_searchUsers'(
    parameters?: Parameters<Paths.UsersControllerSearchUsers.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerSearchUsers.Responses.$200>
  /**
   * UsersController_getProfile - 获取当前用户信息
   */
  'UsersController_getProfile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerGetProfile.Responses.$200>
  /**
   * UsersController_updateProfile - 更新当前用户信息
   */
  'UsersController_updateProfile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UsersControllerUpdateProfile.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerUpdateProfile.Responses.$200>
  /**
   * UsersController_getDashboardStats - 获取当前用户仪表盘统计数据
   */
  'UsersController_getDashboardStats'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerGetDashboardStats.Responses.$200>
  /**
   * UsersController_findOne - 根据 ID 获取用户
   */
  'UsersController_findOne'(
    parameters?: Parameters<Paths.UsersControllerFindOne.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerFindOne.Responses.$200>
  /**
   * UsersController_update - 更新用户
   */
  'UsersController_update'(
    parameters?: Parameters<Paths.UsersControllerUpdate.PathParameters> | null,
    data?: Paths.UsersControllerUpdate.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerUpdate.Responses.$200>
  /**
   * UsersController_remove - 注销用户账户（软删除）
   */
  'UsersController_remove'(
    parameters?: Parameters<Paths.UsersControllerRemove.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerRemove.Responses.$200>
  /**
   * UsersController_restore - 恢复已注销的用户账户
   */
  'UsersController_restore'(
    parameters?: Parameters<Paths.UsersControllerRestore.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerRestore.Responses.$200>
  /**
   * UsersController_deleteImmediately - 立即注销指定用户账户（软删除 + 立即清理）
   */
  'UsersController_deleteImmediately'(
    parameters?: Parameters<Paths.UsersControllerDeleteImmediately.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerDeleteImmediately.Responses.$200>
  /**
   * UsersController_deactivateAccount - 注销用户账户
   */
  'UsersController_deactivateAccount'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UsersControllerDeactivateAccount.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerDeactivateAccount.Responses.$200>
  /**
   * UsersController_restoreAccount - 恢复已注销账户（冷静期内）
   */
  'UsersController_restoreAccount'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UsersControllerRestoreAccount.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerRestoreAccount.Responses.$200>
  /**
   * UsersController_changePassword - 修改密码
   */
  'UsersController_changePassword'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UsersControllerChangePassword.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.UsersControllerChangePassword.Responses.$200>
  /**
   * RolesController_findAll - 获取所有角色
   */
  'RolesController_findAll'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerFindAll.Responses.$200>
  /**
   * RolesController_create - 创建新角色
   */
  'RolesController_create'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.RolesControllerCreate.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerCreate.Responses.$201>
  /**
   * RolesController_findOne - 根据 ID 获取角色
   */
  'RolesController_findOne'(
    parameters?: Parameters<Paths.RolesControllerFindOne.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerFindOne.Responses.$200>
  /**
   * RolesController_update - 更新角色
   */
  'RolesController_update'(
    parameters?: Parameters<Paths.RolesControllerUpdate.PathParameters> | null,
    data?: Paths.RolesControllerUpdate.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerUpdate.Responses.$200>
  /**
   * RolesController_remove - 删除角色
   */
  'RolesController_remove'(
    parameters?: Parameters<Paths.RolesControllerRemove.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerRemove.Responses.$200>
  /**
   * RolesController_getRolePermissions - 获取角色的所有权限
   */
  'RolesController_getRolePermissions'(
    parameters?: Parameters<Paths.RolesControllerGetRolePermissions.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerGetRolePermissions.Responses.$200>
  /**
   * RolesController_addPermissions - 为角色分配权限
   */
  'RolesController_addPermissions'(
    parameters?: Parameters<Paths.RolesControllerAddPermissions.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerAddPermissions.Responses.$200>
  /**
   * RolesController_removePermissions - 从角色移除权限
   */
  'RolesController_removePermissions'(
    parameters?: Parameters<Paths.RolesControllerRemovePermissions.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerRemovePermissions.Responses.$200>
  /**
   * RolesController_getAllProjectRoles - 获取所有项目角色
   */
  'RolesController_getAllProjectRoles'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerGetAllProjectRoles.Responses.$200>
  /**
   * RolesController_getSystemProjectRoles - 获取系统默认项目角色
   */
  'RolesController_getSystemProjectRoles'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerGetSystemProjectRoles.Responses.$200>
  /**
   * RolesController_getProjectRolesByProject - 获取特定项目的角色列表
   */
  'RolesController_getProjectRolesByProject'(
    parameters?: Parameters<Paths.RolesControllerGetProjectRolesByProject.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerGetProjectRolesByProject.Responses.$200>
  /**
   * RolesController_getProjectRolePermissions - 获取项目角色的所有权限
   */
  'RolesController_getProjectRolePermissions'(
    parameters?: Parameters<Paths.RolesControllerGetProjectRolePermissions.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerGetProjectRolePermissions.Responses.$200>
  /**
   * RolesController_addProjectRolePermissions - 为项目角色分配权限
   */
  'RolesController_addProjectRolePermissions'(
    parameters?: Parameters<Paths.RolesControllerAddProjectRolePermissions.PathParameters> | null,
    data?: Paths.RolesControllerAddProjectRolePermissions.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerAddProjectRolePermissions.Responses.$200>
  /**
   * RolesController_removeProjectRolePermissions - 从项目角色移除权限
   */
  'RolesController_removeProjectRolePermissions'(
    parameters?: Parameters<Paths.RolesControllerRemoveProjectRolePermissions.PathParameters> | null,
    data?: Paths.RolesControllerRemoveProjectRolePermissions.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerRemoveProjectRolePermissions.Responses.$200>
  /**
   * RolesController_createProjectRole - 创建项目角色
   */
  'RolesController_createProjectRole'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.RolesControllerCreateProjectRole.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerCreateProjectRole.Responses.$201>
  /**
   * RolesController_updateProjectRole - 更新项目角色
   */
  'RolesController_updateProjectRole'(
    parameters?: Parameters<Paths.RolesControllerUpdateProjectRole.PathParameters> | null,
    data?: Paths.RolesControllerUpdateProjectRole.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerUpdateProjectRole.Responses.$200>
  /**
   * RolesController_deleteProjectRole - 删除项目角色
   */
  'RolesController_deleteProjectRole'(
    parameters?: Parameters<Paths.RolesControllerDeleteProjectRole.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.RolesControllerDeleteProjectRole.Responses.$200>
  /**
   * AuditLogController_findAll - 查询审计日志
   */
  'AuditLogController_findAll'(
    parameters?: Parameters<Paths.AuditLogControllerFindAll.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuditLogControllerFindAll.Responses.$200>
  /**
   * AuditLogController_findOne - 获取审计日志详情
   */
  'AuditLogController_findOne'(
    parameters?: Parameters<Paths.AuditLogControllerFindOne.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuditLogControllerFindOne.Responses.$200>
  /**
   * AuditLogController_getStatistics - 获取审计统计信息
   */
  'AuditLogController_getStatistics'(
    parameters?: Parameters<Paths.AuditLogControllerGetStatistics.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuditLogControllerGetStatistics.Responses.$200>
  /**
   * AuditLogController_cleanupOldLogs - 清理旧审计日志
   */
  'AuditLogController_cleanupOldLogs'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AuditLogControllerCleanupOldLogs.Responses.$200>
  /**
   * FileSystemController_getProjects - 获取项目列表
   */
  'FileSystemController_getProjects'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetProjects.Responses.$200>
  /**
   * FileSystemController_createProject - 创建项目
   */
  'FileSystemController_createProject'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerCreateProject.Responses.$201>
  /**
   * FileSystemController_getPersonalSpace - 获取当前用户的私人空间
   */
  'FileSystemController_getPersonalSpace'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetPersonalSpace.Responses.$200>
  /**
   * FileSystemController_getProject - 获取项目详情
   */
  'FileSystemController_getProject'(
    parameters?: Parameters<Paths.FileSystemControllerGetProject.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetProject.Responses.$200>
  /**
   * FileSystemController_getTrash - 获取回收站列表
   */
  'FileSystemController_getTrash'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetTrash.Responses.$200>
  /**
   * FileSystemController_clearTrash - 清空回收站
   */
  'FileSystemController_clearTrash'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerClearTrash.Responses.$200>
  /**
   * FileSystemController_restoreTrashItems - 恢复回收站项目
   */
  'FileSystemController_restoreTrashItems'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerRestoreTrashItems.Responses.$200>
  /**
   * FileSystemController_permanentlyDeleteTrashItems - 永久删除回收站项目
   */
  'FileSystemController_permanentlyDeleteTrashItems'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerPermanentlyDeleteTrashItems.Responses.$200>
  /**
   * FileSystemController_createNode - 创建节点（文件或文件夹）
   */
  'FileSystemController_createNode'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerCreateNode.Responses.$201>
  /**
   * FileSystemController_createFolder - 创建文件夹
   */
  'FileSystemController_createFolder'(
    parameters?: Parameters<Paths.FileSystemControllerCreateFolder.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerCreateFolder.Responses.$201>
  /**
   * FileSystemController_getRootNode - 获取节点的根节点
   */
  'FileSystemController_getRootNode'(
    parameters?: Parameters<Paths.FileSystemControllerGetRootNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetRootNode.Responses.$200>
  /**
   * FileSystemController_restoreNode - 恢复单个节点
   */
  'FileSystemController_restoreNode'(
    parameters?: Parameters<Paths.FileSystemControllerRestoreNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerRestoreNode.Responses.$200>
  /**
   * FileSystemController_getNode - 获取节点详情
   */
  'FileSystemController_getNode'(
    parameters?: Parameters<Paths.FileSystemControllerGetNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetNode.Responses.$200>
  /**
   * FileSystemController_updateNode - 更新节点
   */
  'FileSystemController_updateNode'(
    parameters?: Parameters<Paths.FileSystemControllerUpdateNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerUpdateNode.Responses.$200>
  /**
   * FileSystemController_deleteNode - 删除节点
   */
  'FileSystemController_deleteNode'(
    parameters?: Parameters<Paths.FileSystemControllerDeleteNode.QueryParameters & Paths.FileSystemControllerDeleteNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerDeleteNode.Responses.$200>
  /**
   * FileSystemController_getChildren - 获取子节点列表
   */
  'FileSystemController_getChildren'(
    parameters?: Parameters<Paths.FileSystemControllerGetChildren.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetChildren.Responses.$200>
  /**
   * FileSystemController_moveNode - 移动节点
   */
  'FileSystemController_moveNode'(
    parameters?: Parameters<Paths.FileSystemControllerMoveNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerMoveNode.Responses.$200>
  /**
   * FileSystemController_copyNode - 复制节点
   */
  'FileSystemController_copyNode'(
    parameters?: Parameters<Paths.FileSystemControllerCopyNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerCopyNode.Responses.$201>
  /**
   * FileSystemController_getStorageQuota - 获取存储配额信息
   */
  'FileSystemController_getStorageQuota'(
    parameters?: Parameters<Paths.FileSystemControllerGetStorageQuota.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetStorageQuota.Responses.$200>
  /**
   * FileSystemController_updateStorageQuota - 更新节点存储配额
   */
  'FileSystemController_updateStorageQuota'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerUpdateStorageQuota.Responses.$200>
  /**
   * FileSystemController_getProjectMembers - 获取项目成员列表
   */
  'FileSystemController_getProjectMembers'(
    parameters?: Parameters<Paths.FileSystemControllerGetProjectMembers.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetProjectMembers.Responses.$200>
  /**
   * FileSystemController_addProjectMember - 添加项目成员
   */
  'FileSystemController_addProjectMember'(
    parameters?: Parameters<Paths.FileSystemControllerAddProjectMember.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerAddProjectMember.Responses.$201>
  /**
   * FileSystemController_updateProjectMember - 更新项目成员角色
   */
  'FileSystemController_updateProjectMember'(
    parameters?: Parameters<Paths.FileSystemControllerUpdateProjectMember.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerUpdateProjectMember.Responses.$200>
  /**
   * FileSystemController_removeProjectMember - 移除项目成员
   */
  'FileSystemController_removeProjectMember'(
    parameters?: Parameters<Paths.FileSystemControllerRemoveProjectMember.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerRemoveProjectMember.Responses.$200>
  /**
   * FileSystemController_getThumbnail - 获取文件节点缩略图
   */
  'FileSystemController_getThumbnail'(
    parameters?: Parameters<Paths.FileSystemControllerGetThumbnail.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetThumbnail.Responses.$200 | Paths.FileSystemControllerGetThumbnail.Responses.$204>
  /**
   * FileSystemController_downloadNode - 下载节点（文件或目录）
   */
  'FileSystemController_downloadNode'(
    parameters?: Parameters<Paths.FileSystemControllerDownloadNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerDownloadNode.Responses.$200>
  /**
   * FileSystemController_downloadNodeOptions - 下载接口 OPTIONS 预检
   */
  'FileSystemController_downloadNodeOptions'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerDownloadNodeOptions.Responses.$200>
  /**
   * FileSystemController_downloadNodeWithFormat - 下载节点（支持多格式转换）
   * 
   * 支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。
   */
  'FileSystemController_downloadNodeWithFormat'(
    parameters?: Parameters<Paths.FileSystemControllerDownloadNodeWithFormat.QueryParameters & Paths.FileSystemControllerDownloadNodeWithFormat.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerDownloadNodeWithFormat.Responses.$200>
  /**
   * FileSystemController_getUserProjectPermissions - 获取用户在项目中的权限列表
   */
  'FileSystemController_getUserProjectPermissions'(
    parameters?: Parameters<Paths.FileSystemControllerGetUserProjectPermissions.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetUserProjectPermissions.Responses.$200>
  /**
   * FileSystemController_checkProjectPermission - 检查用户是否具有特定权限
   */
  'FileSystemController_checkProjectPermission'(
    parameters?: Parameters<Paths.FileSystemControllerCheckProjectPermission.QueryParameters & Paths.FileSystemControllerCheckProjectPermission.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerCheckProjectPermission.Responses.$200>
  /**
   * FileSystemController_getUserProjectRole - 获取用户在项目中的角色
   */
  'FileSystemController_getUserProjectRole'(
    parameters?: Parameters<Paths.FileSystemControllerGetUserProjectRole.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerGetUserProjectRole.Responses.$200>
  /**
   * FileSystemController_search - 统一搜索接口
   * 
   * 支持多种搜索范围：
   * - project: 搜索项目列表
   * - project_files: 搜索指定项目内的文件（需提供 projectId）
   * - all_projects: 搜索所有有权限访问的项目中的文件
   */
  'FileSystemController_search'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FileSystemControllerSearch.Responses.$200>
  /**
   * VersionControlController_getFileHistory - 获取节点的 SVN 提交历史
   */
  'VersionControlController_getFileHistory'(
    parameters?: Parameters<Paths.VersionControlControllerGetFileHistory.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.VersionControlControllerGetFileHistory.Responses.$200>
  /**
   * VersionControlController_getFileContentAtRevision - 获取指定版本的文件内容
   */
  'VersionControlController_getFileContentAtRevision'(
    parameters?: Parameters<Paths.VersionControlControllerGetFileContentAtRevision.QueryParameters & Paths.VersionControlControllerGetFileContentAtRevision.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.VersionControlControllerGetFileContentAtRevision.Responses.$200>
  /**
   * FontsController_getFonts - 获取字体列表
   * 
   * 获取所有字体文件，前端负责分页、筛选和排序
   */
  'FontsController_getFonts'(
    parameters?: Parameters<Paths.FontsControllerGetFonts.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FontsControllerGetFonts.Responses.$200>
  /**
   * FontsController_uploadFont - 上传字体文件
   * 
   * 上传字体文件到指定目录
   */
  'FontsController_uploadFont'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.FontsControllerUploadFont.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FontsControllerUploadFont.Responses.$201>
  /**
   * FontsController_deleteFont - 删除字体文件
   * 
   * 从指定目录删除字体文件
   */
  'FontsController_deleteFont'(
    parameters?: Parameters<Paths.FontsControllerDeleteFont.QueryParameters & Paths.FontsControllerDeleteFont.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FontsControllerDeleteFont.Responses.$200>
  /**
   * FontsController_downloadFont - 下载字体文件
   * 
   * 下载指定位置的字体文件
   */
  'FontsController_downloadFont'(
    parameters?: Parameters<Paths.FontsControllerDownloadFont.QueryParameters & Paths.FontsControllerDownloadFont.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.FontsControllerDownloadFont.Responses.$200>
  /**
   * MxCadController_checkChunkExist
   */
  'MxCadController_checkChunkExist'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerCheckChunkExist.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerCheckChunkExist.Responses.$200>
  /**
   * MxCadController_checkFileExist
   */
  'MxCadController_checkFileExist'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerCheckFileExist.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerCheckFileExist.Responses.$200>
  /**
   * MxCadController_checkDuplicateFile - 检查目录中是否存在重复文件
   */
  'MxCadController_checkDuplicateFile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerCheckDuplicateFile.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerCheckDuplicateFile.Responses.$200>
  /**
   * MxCadController_getPreloadingData
   */
  'MxCadController_getPreloadingData'(
    parameters?: Parameters<Paths.MxCadControllerGetPreloadingData.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetPreloadingData.Responses.$200>
  /**
   * MxCadController_checkExternalReference
   */
  'MxCadController_checkExternalReference'(
    parameters?: Parameters<Paths.MxCadControllerCheckExternalReference.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerCheckExternalReference.Responses.$200>
  /**
   * MxCadController_refreshExternalReferences
   */
  'MxCadController_refreshExternalReferences'(
    parameters?: Parameters<Paths.MxCadControllerRefreshExternalReferences.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerRefreshExternalReferences.Responses.$200>
  /**
   * MxCadController_uploadFile
   */
  'MxCadController_uploadFile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerUploadFile.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerUploadFile.Responses.$200>
  /**
   * MxCadController_saveMxwebToNode
   */
  'MxCadController_saveMxwebToNode'(
    parameters?: Parameters<Paths.MxCadControllerSaveMxwebToNode.PathParameters> | null,
    data?: Paths.MxCadControllerSaveMxwebToNode.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerSaveMxwebToNode.Responses.$200>
  /**
   * MxCadController_saveMxwebAs
   */
  'MxCadController_saveMxwebAs'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerSaveMxwebAs.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerSaveMxwebAs.Responses.$200>
  /**
   * MxCadController_uploadExtReferenceDwg
   */
  'MxCadController_uploadExtReferenceDwg'(
    parameters?: Parameters<Paths.MxCadControllerUploadExtReferenceDwg.PathParameters> | null,
    data?: Paths.MxCadControllerUploadExtReferenceDwg.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerUploadExtReferenceDwg.Responses.$200>
  /**
   * MxCadController_uploadExtReferenceImage
   */
  'MxCadController_uploadExtReferenceImage'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.MxCadControllerUploadExtReferenceImage.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerUploadExtReferenceImage.Responses.$200>
  /**
   * MxCadController_getFilesDataFile
   */
  'MxCadController_getFilesDataFile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetFilesDataFile.Responses.$200>
  /**
   * MxCadController_getFilesDataFileHead
   */
  'MxCadController_getFilesDataFileHead'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetFilesDataFileHead.Responses.$200>
  /**
   * MxCadController_getFile
   */
  'MxCadController_getFile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetFile.Responses.$200>
  /**
   * MxCadController_getFileHead
   */
  'MxCadController_getFileHead'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetFileHead.Responses.$200>
  /**
   * MxCadController_checkThumbnail
   */
  'MxCadController_checkThumbnail'(
    parameters?: Parameters<Paths.MxCadControllerCheckThumbnail.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerCheckThumbnail.Responses.$200>
  /**
   * MxCadController_uploadThumbnail
   */
  'MxCadController_uploadThumbnail'(
    parameters?: Parameters<Paths.MxCadControllerUploadThumbnail.PathParameters> | null,
    data?: Paths.MxCadControllerUploadThumbnail.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerUploadThumbnail.Responses.$200>
  /**
   * MxCadController_getNonCadFile
   */
  'MxCadController_getNonCadFile'(
    parameters?: Parameters<Paths.MxCadControllerGetNonCadFile.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.MxCadControllerGetNonCadFile.Responses.$200>
  /**
   * AdminController_getAdminStats - 获取管理员统计信息
   */
  'AdminController_getAdminStats'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AdminControllerGetAdminStats.Responses.$200>
  /**
   * AdminController_cleanupStorage - 手动触发存储清理
   */
  'AdminController_cleanupStorage'(
    parameters?: Parameters<Paths.AdminControllerCleanupStorage.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AdminControllerCleanupStorage.Responses.$200>
  /**
   * AdminController_getCleanupStats - 获取待清理存储统计
   */
  'AdminController_getCleanupStats'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.AdminControllerGetCleanupStats.Responses.$200>
  /**
   * HealthController_liveness - 存活检查（Docker 健康检查）
   */
  'HealthController_liveness'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthControllerLiveness.Responses.$200>
  /**
   * HealthController_publicHealth - 服务健康检查（公开）
   */
  'HealthController_publicHealth'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthControllerPublicHealth.Responses.$200>
  /**
   * HealthController_check - 系统健康检查（详细）
   */
  'HealthController_check'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthControllerCheck.Responses.$200>
  /**
   * HealthController_checkDatabase - 数据库健康检查
   */
  'HealthController_checkDatabase'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthControllerCheckDatabase.Responses.$200>
  /**
   * HealthController_checkStorage - 存储服务健康检查
   */
  'HealthController_checkStorage'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthControllerCheckStorage.Responses.$200>
  /**
   * PublicFileController_checkChunk - 检查分片是否存在
   */
  'PublicFileController_checkChunk'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.PublicFileControllerCheckChunk.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerCheckChunk.Responses.$200>
  /**
   * PublicFileController_checkFile - 检查文件是否已存在（秒传检查）
   */
  'PublicFileController_checkFile'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.PublicFileControllerCheckFile.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerCheckFile.Responses.$200>
  /**
   * PublicFileController_uploadChunk - 上传分片
   */
  'PublicFileController_uploadChunk'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.PublicFileControllerUploadChunk.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerUploadChunk.Responses.$200>
  /**
   * PublicFileController_mergeChunks - 合并分片并获取文件访问信息
   */
  'PublicFileController_mergeChunks'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.PublicFileControllerMergeChunks.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerMergeChunks.Responses.$200>
  /**
   * PublicFileController_accessFile - 通过文件哈希访问目录下的文件
   */
  'PublicFileController_accessFile'(
    parameters?: Parameters<Paths.PublicFileControllerAccessFile.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<any>
  /**
   * PublicFileController_uploadExtReference - 上传外部参照文件（公开接口）
   */
  'PublicFileController_uploadExtReference'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.PublicFileControllerUploadExtReference.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerUploadExtReference.Responses.$200>
  /**
   * PublicFileController_checkExtReference - 检查外部参照文件是否存在
   */
  'PublicFileController_checkExtReference'(
    parameters?: Parameters<Paths.PublicFileControllerCheckExtReference.QueryParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerCheckExtReference.Responses.$200>
  /**
   * PublicFileController_getPreloadingData - 获取预加载数据（包含外部参照信息）
   */
  'PublicFileController_getPreloadingData'(
    parameters?: Parameters<Paths.PublicFileControllerGetPreloadingData.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublicFileControllerGetPreloadingData.Responses.$200>
  /**
   * LibraryController_getDrawingLibrary - 获取图纸库详情
   */
  'LibraryController_getDrawingLibrary'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetDrawingLibrary.Responses.$200>
  /**
   * LibraryController_getDrawingChildren - 获取图纸库子节点列表
   */
  'LibraryController_getDrawingChildren'(
    parameters?: Parameters<Paths.LibraryControllerGetDrawingChildren.QueryParameters & Paths.LibraryControllerGetDrawingChildren.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetDrawingChildren.Responses.$200>
  /**
   * LibraryController_getDrawingAllFiles - 递归获取图纸库节点下的所有文件
   */
  'LibraryController_getDrawingAllFiles'(
    parameters?: Parameters<Paths.LibraryControllerGetDrawingAllFiles.QueryParameters & Paths.LibraryControllerGetDrawingAllFiles.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetDrawingAllFiles.Responses.$200>
  /**
   * LibraryController_getDrawingFile - 获取图纸库文件（统一入口）
   */
  'LibraryController_getDrawingFile'(
    parameters?: Parameters<Paths.LibraryControllerGetDrawingFile.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<any>
  /**
   * LibraryController_getDrawingNode - 获取图纸库节点详情
   */
  'LibraryController_getDrawingNode'(
    parameters?: Parameters<Paths.LibraryControllerGetDrawingNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetDrawingNode.Responses.$200>
  /**
   * LibraryController_downloadDrawingNode - 下载图纸库文件
   */
  'LibraryController_downloadDrawingNode'(
    parameters?: Parameters<Paths.LibraryControllerDownloadDrawingNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerDownloadDrawingNode.Responses.$200>
  /**
   * LibraryController_getDrawingThumbnail - 获取图纸库文件缩略图
   */
  'LibraryController_getDrawingThumbnail'(
    parameters?: Parameters<Paths.LibraryControllerGetDrawingThumbnail.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetDrawingThumbnail.Responses.$200>
  /**
   * LibraryController_getBlockLibrary - 获取图块库详情
   */
  'LibraryController_getBlockLibrary'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetBlockLibrary.Responses.$200>
  /**
   * LibraryController_getBlockChildren - 获取图块库子节点列表
   */
  'LibraryController_getBlockChildren'(
    parameters?: Parameters<Paths.LibraryControllerGetBlockChildren.QueryParameters & Paths.LibraryControllerGetBlockChildren.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetBlockChildren.Responses.$200>
  /**
   * LibraryController_getBlockAllFiles - 递归获取图块库节点下的所有文件
   */
  'LibraryController_getBlockAllFiles'(
    parameters?: Parameters<Paths.LibraryControllerGetBlockAllFiles.QueryParameters & Paths.LibraryControllerGetBlockAllFiles.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetBlockAllFiles.Responses.$200>
  /**
   * LibraryController_getBlockFile - 获取图块库文件（统一入口）
   */
  'LibraryController_getBlockFile'(
    parameters?: Parameters<Paths.LibraryControllerGetBlockFile.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<any>
  /**
   * LibraryController_getBlockNode - 获取图块库节点详情
   */
  'LibraryController_getBlockNode'(
    parameters?: Parameters<Paths.LibraryControllerGetBlockNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetBlockNode.Responses.$200>
  /**
   * LibraryController_downloadBlockNode - 下载图块库文件
   */
  'LibraryController_downloadBlockNode'(
    parameters?: Parameters<Paths.LibraryControllerDownloadBlockNode.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerDownloadBlockNode.Responses.$200>
  /**
   * LibraryController_getBlockThumbnail - 获取图块库文件缩略图
   */
  'LibraryController_getBlockThumbnail'(
    parameters?: Parameters<Paths.LibraryControllerGetBlockThumbnail.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.LibraryControllerGetBlockThumbnail.Responses.$200>
}

export interface PathsDictionary {
  ['/api/v1/cache-monitor/summary']: {
    /**
     * CacheMonitorController_getSummary - 获取缓存监控摘要
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetSummary.Responses.$200>
  }
  ['/api/v1/cache-monitor/health']: {
    /**
     * CacheMonitorController_getHealthStatus - 获取缓存健康状态
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetHealthStatus.Responses.$200>
  }
  ['/api/v1/cache-monitor/performance']: {
    /**
     * CacheMonitorController_getPerformanceMetrics - 获取缓存性能指标
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetPerformanceMetrics.Responses.$200>
  }
  ['/api/v1/cache-monitor/hot-data']: {
    /**
     * CacheMonitorController_getHotData - 获取热点数据
     */
    'get'(
      parameters?: Parameters<Paths.CacheMonitorControllerGetHotData.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetHotData.Responses.$200>
  }
  ['/api/v1/cache-monitor/performance-trend']: {
    /**
     * CacheMonitorController_getPerformanceTrend - 获取性能趋势
     */
    'get'(
      parameters?: Parameters<Paths.CacheMonitorControllerGetPerformanceTrend.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetPerformanceTrend.Responses.$200>
  }
  ['/api/v1/cache-monitor/size-trend']: {
    /**
     * CacheMonitorController_getSizeTrend - 获取缓存大小趋势
     */
    'get'(
      parameters?: Parameters<Paths.CacheMonitorControllerGetSizeTrend.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetSizeTrend.Responses.$200>
  }
  ['/api/v1/cache-monitor/warnings']: {
    /**
     * CacheMonitorController_getWarnings - 获取缓存警告
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetWarnings.Responses.$200>
  }
  ['/api/v1/cache-monitor/value']: {
    /**
     * CacheMonitorController_getValue - 获取缓存值
     */
    'get'(
      parameters?: Parameters<Paths.CacheMonitorControllerGetValue.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetValue.Responses.$200>
    /**
     * CacheMonitorController_deleteValue - 删除缓存
     */
    'delete'(
      parameters?: Parameters<Paths.CacheMonitorControllerDeleteValue.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerDeleteValue.Responses.$200>
  }
  ['/api/v1/cache-monitor/values']: {
    /**
     * CacheMonitorController_deleteValues - 批量删除缓存
     */
    'delete'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CacheMonitorControllerDeleteValues.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerDeleteValues.Responses.$200>
  }
  ['/api/v1/cache-monitor/refresh']: {
    /**
     * CacheMonitorController_refresh - 刷新缓存
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CacheMonitorControllerRefresh.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerRefresh.Responses.$200>
  }
  ['/api/v1/cache-monitor/cleanup']: {
    /**
     * CacheMonitorController_cleanup - 清理缓存
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CacheMonitorControllerCleanup.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerCleanup.Responses.$200>
  }
  ['/api/v1/cache-monitor/warmup/config']: {
    /**
     * CacheMonitorController_getWarmupConfig - 获取预热配置
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetWarmupConfig.Responses.$200>
    /**
     * CacheMonitorController_updateWarmupConfig - 更新预热配置
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CacheMonitorControllerUpdateWarmupConfig.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerUpdateWarmupConfig.Responses.$200>
  }
  ['/api/v1/cache-monitor/warmup/trigger']: {
    /**
     * CacheMonitorController_triggerWarmup - 触发预热
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CacheMonitorControllerTriggerWarmup.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerTriggerWarmup.Responses.$200>
  }
  ['/api/v1/cache-monitor/warmup/history']: {
    /**
     * CacheMonitorController_getWarmupHistory - 获取预热历史
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetWarmupHistory.Responses.$200>
    /**
     * CacheMonitorController_clearWarmupHistory - 清除预热历史
     */
    'delete'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerClearWarmupHistory.Responses.$200>
  }
  ['/api/v1/cache-monitor/warmup/stats']: {
    /**
     * CacheMonitorController_getWarmupStats - 获取预热统计
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.CacheMonitorControllerGetWarmupStats.Responses.$200>
  }
  ['/api/v1/auth/register']: {
    /**
     * AuthController_register - 用户注册
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerRegister.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerRegister.Responses.$201>
  }
  ['/api/v1/auth/login']: {
    /**
     * AuthController_login - 用户登录
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerLogin.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerLogin.Responses.$200>
  }
  ['/api/v1/auth/refresh']: {
    /**
     * AuthController_refreshToken - 刷新Token
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerRefreshToken.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerRefreshToken.Responses.$200>
  }
  ['/api/v1/auth/logout']: {
    /**
     * AuthController_logout - 用户登出
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerLogout.Responses.$200>
  }
  ['/api/v1/auth/profile']: {
    /**
     * AuthController_getProfile - 获取用户信息
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerGetProfile.Responses.$200>
  }
  ['/api/v1/auth/send-verification']: {
    /**
     * AuthController_sendVerification - 发送邮箱验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerSendVerification.Responses.$200>
  }
  ['/api/v1/auth/verify-email']: {
    /**
     * AuthController_verifyEmail - 验证邮箱
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerVerifyEmail.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyEmail.Responses.$200>
  }
  ['/api/v1/auth/verify-email-and-register-phone']: {
    /**
     * AuthController_verifyEmailAndRegisterPhone - 验证邮箱并完成手机号注册
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyEmailAndRegisterPhone.Responses.$201>
  }
  ['/api/v1/auth/resend-verification']: {
    /**
     * AuthController_resendVerification - 重发验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerResendVerification.Responses.$200>
  }
  ['/api/v1/auth/bind-email-and-login']: {
    /**
     * AuthController_bindEmailAndLogin - 绑定邮箱并登录（用于已注册但没有邮箱的用户）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerBindEmailAndLogin.Responses.$200>
  }
  ['/api/v1/auth/bind-phone-and-login']: {
    /**
     * AuthController_bindPhoneAndLogin - 绑定手机号并登录（用于已注册但没有手机号的用户）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerBindPhoneAndLogin.Responses.$200>
  }
  ['/api/v1/auth/verify-phone']: {
    /**
     * AuthController_verifyPhone - 验证手机号（用于已注册但手机号未验证的用户）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyPhone.Responses.$200>
  }
  ['/api/v1/auth/forgot-password']: {
    /**
     * AuthController_forgotPassword - 忘记密码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerForgotPassword.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerForgotPassword.Responses.$200>
  }
  ['/api/v1/auth/reset-password']: {
    /**
     * AuthController_resetPassword - 重置密码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerResetPassword.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerResetPassword.Responses.$200>
  }
  ['/api/v1/auth/bind-email']: {
    /**
     * AuthController_sendBindEmailCode - 发送绑定邮箱验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerSendBindEmailCode.Responses.$200>
  }
  ['/api/v1/auth/verify-bind-email']: {
    /**
     * AuthController_verifyBindEmail - 验证并绑定邮箱
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.AuthControllerVerifyBindEmail.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyBindEmail.Responses.$200>
  }
  ['/api/v1/auth/send-unbind-email-code']: {
    /**
     * AuthController_sendUnbindEmailCode - 发送解绑邮箱验证码（验证原邮箱）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerSendUnbindEmailCode.Responses.$200>
  }
  ['/api/v1/auth/verify-unbind-email-code']: {
    /**
     * AuthController_verifyUnbindEmailCode - 验证解绑邮箱验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyUnbindEmailCode.Responses.$200>
  }
  ['/api/v1/auth/rebind-email']: {
    /**
     * AuthController_rebindEmail - 换绑邮箱（需要先验证原邮箱）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerRebindEmail.Responses.$200>
  }
  ['/api/v1/auth/send-sms-code']: {
    /**
     * AuthController_sendSmsCode - 发送短信验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerSendSmsCode.Responses.$200>
  }
  ['/api/v1/auth/verify-sms-code']: {
    /**
     * AuthController_verifySmsCode - 验证短信验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifySmsCode.Responses.$200>
  }
  ['/api/v1/auth/register-phone']: {
    /**
     * AuthController_registerByPhone - 手机号注册
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerRegisterByPhone.Responses.$201>
  }
  ['/api/v1/auth/login-phone']: {
    /**
     * AuthController_loginByPhone - 手机号验证码登录
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerLoginByPhone.Responses.$200>
  }
  ['/api/v1/auth/bind-phone']: {
    /**
     * AuthController_bindPhone - 绑定手机号
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerBindPhone.Responses.$200>
  }
  ['/api/v1/auth/send-unbind-phone-code']: {
    /**
     * AuthController_sendUnbindPhoneCode - 发送解绑手机号验证码（验证原手机号）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerSendUnbindPhoneCode.Responses.$200>
  }
  ['/api/v1/auth/verify-unbind-phone-code']: {
    /**
     * AuthController_verifyUnbindPhoneCode - 验证解绑手机号验证码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerVerifyUnbindPhoneCode.Responses.$200>
  }
  ['/api/v1/auth/rebind-phone']: {
    /**
     * AuthController_rebindPhone - 换绑手机号（需要先验证原手机号）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerRebindPhone.Responses.$200>
  }
  ['/api/v1/auth/check-field']: {
    /**
     * AuthController_checkFieldUniqueness - 检查字段唯一性（用户名、邮箱、手机号）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerCheckFieldUniqueness.Responses.$200>
  }
  ['/api/v1/auth/wechat/login']: {
    /**
     * AuthController_getWechatAuthUrl - 获取微信授权 URL
     */
    'get'(
      parameters?: Parameters<Paths.AuthControllerGetWechatAuthUrl.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerGetWechatAuthUrl.Responses.$200>
  }
  ['/api/v1/auth/wechat/callback']: {
    /**
     * AuthController_wechatCallback - 微信授权回调
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerWechatCallback.Responses.$200>
  }
  ['/api/v1/auth/wechat/bind']: {
    /**
     * AuthController_bindWechat - 绑定微信到当前账号
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerBindWechat.Responses.$200>
  }
  ['/api/v1/auth/wechat/unbind']: {
    /**
     * AuthController_unbindWechat - 解绑微信
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuthControllerUnbindWechat.Responses.$200>
  }
  ['/api/v1/user-cleanup/stats']: {
    /**
     * UserCleanupController_getStats - 获取待清理用户统计
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UserCleanupControllerGetStats.Responses.$200>
  }
  ['/api/v1/user-cleanup/trigger']: {
    /**
     * UserCleanupController_triggerCleanup - 手动触发用户数据清理
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UserCleanupControllerTriggerCleanup.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UserCleanupControllerTriggerCleanup.Responses.$200>
  }
  ['/api/v1/runtime-config/public']: {
    /**
     * RuntimeConfigController_getPublicConfigs - 获取公开配置（前端初始化使用）
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerGetPublicConfigs.Responses.$200>
  }
  ['/api/v1/runtime-config']: {
    /**
     * RuntimeConfigController_getAllConfigs - 获取所有运行时配置
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerGetAllConfigs.Responses.$200>
  }
  ['/api/v1/runtime-config/definitions']: {
    /**
     * RuntimeConfigController_getDefinitions - 获取配置项定义
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerGetDefinitions.Responses.$200>
  }
  ['/api/v1/runtime-config/{key}']: {
    /**
     * RuntimeConfigController_getConfig - 获取单个配置项
     */
    'get'(
      parameters?: Parameters<Paths.RuntimeConfigControllerGetConfig.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerGetConfig.Responses.$200>
    /**
     * RuntimeConfigController_updateConfig - 更新配置项
     */
    'put'(
      parameters?: Parameters<Paths.RuntimeConfigControllerUpdateConfig.PathParameters> | null,
      data?: Paths.RuntimeConfigControllerUpdateConfig.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerUpdateConfig.Responses.$200>
  }
  ['/api/v1/runtime-config/{key}/reset']: {
    /**
     * RuntimeConfigController_resetConfig - 重置配置为默认值
     */
    'post'(
      parameters?: Parameters<Paths.RuntimeConfigControllerResetConfig.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RuntimeConfigControllerResetConfig.Responses.$201>
  }
  ['/api/v1/users']: {
    /**
     * UsersController_create - 创建用户
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UsersControllerCreate.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerCreate.Responses.$201>
    /**
     * UsersController_findAll - 获取用户列表
     */
    'get'(
      parameters?: Parameters<Paths.UsersControllerFindAll.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerFindAll.Responses.$200>
  }
  ['/api/v1/users/search/by-email']: {
    /**
     * UsersController_searchByEmail - 根据邮箱搜索用户
     */
    'get'(
      parameters?: Parameters<Paths.UsersControllerSearchByEmail.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerSearchByEmail.Responses.$200>
  }
  ['/api/v1/users/search']: {
    /**
     * UsersController_searchUsers - 搜索用户（用于添加项目成员）
     */
    'get'(
      parameters?: Parameters<Paths.UsersControllerSearchUsers.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerSearchUsers.Responses.$200>
  }
  ['/api/v1/users/profile/me']: {
    /**
     * UsersController_getProfile - 获取当前用户信息
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerGetProfile.Responses.$200>
    /**
     * UsersController_updateProfile - 更新当前用户信息
     */
    'patch'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UsersControllerUpdateProfile.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerUpdateProfile.Responses.$200>
  }
  ['/api/v1/users/stats/me']: {
    /**
     * UsersController_getDashboardStats - 获取当前用户仪表盘统计数据
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerGetDashboardStats.Responses.$200>
  }
  ['/api/v1/users/{id}']: {
    /**
     * UsersController_findOne - 根据 ID 获取用户
     */
    'get'(
      parameters?: Parameters<Paths.UsersControllerFindOne.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerFindOne.Responses.$200>
    /**
     * UsersController_update - 更新用户
     */
    'patch'(
      parameters?: Parameters<Paths.UsersControllerUpdate.PathParameters> | null,
      data?: Paths.UsersControllerUpdate.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerUpdate.Responses.$200>
    /**
     * UsersController_remove - 注销用户账户（软删除）
     */
    'delete'(
      parameters?: Parameters<Paths.UsersControllerRemove.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerRemove.Responses.$200>
  }
  ['/api/v1/users/{id}/restore']: {
    /**
     * UsersController_restore - 恢复已注销的用户账户
     */
    'post'(
      parameters?: Parameters<Paths.UsersControllerRestore.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerRestore.Responses.$200>
  }
  ['/api/v1/users/{id}/delete-immediately']: {
    /**
     * UsersController_deleteImmediately - 立即注销指定用户账户（软删除 + 立即清理）
     */
    'post'(
      parameters?: Parameters<Paths.UsersControllerDeleteImmediately.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerDeleteImmediately.Responses.$200>
  }
  ['/api/v1/users/deactivate-account']: {
    /**
     * UsersController_deactivateAccount - 注销用户账户
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UsersControllerDeactivateAccount.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerDeactivateAccount.Responses.$200>
  }
  ['/api/v1/users/me/restore']: {
    /**
     * UsersController_restoreAccount - 恢复已注销账户（冷静期内）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UsersControllerRestoreAccount.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerRestoreAccount.Responses.$200>
  }
  ['/api/v1/users/change-password']: {
    /**
     * UsersController_changePassword - 修改密码
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UsersControllerChangePassword.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.UsersControllerChangePassword.Responses.$200>
  }
  ['/api/v1/roles']: {
    /**
     * RolesController_findAll - 获取所有角色
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerFindAll.Responses.$200>
    /**
     * RolesController_create - 创建新角色
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.RolesControllerCreate.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerCreate.Responses.$201>
  }
  ['/api/v1/roles/{id}']: {
    /**
     * RolesController_findOne - 根据 ID 获取角色
     */
    'get'(
      parameters?: Parameters<Paths.RolesControllerFindOne.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerFindOne.Responses.$200>
    /**
     * RolesController_update - 更新角色
     */
    'patch'(
      parameters?: Parameters<Paths.RolesControllerUpdate.PathParameters> | null,
      data?: Paths.RolesControllerUpdate.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerUpdate.Responses.$200>
    /**
     * RolesController_remove - 删除角色
     */
    'delete'(
      parameters?: Parameters<Paths.RolesControllerRemove.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerRemove.Responses.$200>
  }
  ['/api/v1/roles/{id}/permissions']: {
    /**
     * RolesController_getRolePermissions - 获取角色的所有权限
     */
    'get'(
      parameters?: Parameters<Paths.RolesControllerGetRolePermissions.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerGetRolePermissions.Responses.$200>
    /**
     * RolesController_addPermissions - 为角色分配权限
     */
    'post'(
      parameters?: Parameters<Paths.RolesControllerAddPermissions.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerAddPermissions.Responses.$200>
    /**
     * RolesController_removePermissions - 从角色移除权限
     */
    'delete'(
      parameters?: Parameters<Paths.RolesControllerRemovePermissions.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerRemovePermissions.Responses.$200>
  }
  ['/api/v1/roles/project-roles/all']: {
    /**
     * RolesController_getAllProjectRoles - 获取所有项目角色
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerGetAllProjectRoles.Responses.$200>
  }
  ['/api/v1/roles/project-roles/system']: {
    /**
     * RolesController_getSystemProjectRoles - 获取系统默认项目角色
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerGetSystemProjectRoles.Responses.$200>
  }
  ['/api/v1/roles/project-roles/project/{projectId}']: {
    /**
     * RolesController_getProjectRolesByProject - 获取特定项目的角色列表
     */
    'get'(
      parameters?: Parameters<Paths.RolesControllerGetProjectRolesByProject.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerGetProjectRolesByProject.Responses.$200>
  }
  ['/api/v1/roles/project-roles/{id}/permissions']: {
    /**
     * RolesController_getProjectRolePermissions - 获取项目角色的所有权限
     */
    'get'(
      parameters?: Parameters<Paths.RolesControllerGetProjectRolePermissions.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerGetProjectRolePermissions.Responses.$200>
    /**
     * RolesController_addProjectRolePermissions - 为项目角色分配权限
     */
    'post'(
      parameters?: Parameters<Paths.RolesControllerAddProjectRolePermissions.PathParameters> | null,
      data?: Paths.RolesControllerAddProjectRolePermissions.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerAddProjectRolePermissions.Responses.$200>
    /**
     * RolesController_removeProjectRolePermissions - 从项目角色移除权限
     */
    'delete'(
      parameters?: Parameters<Paths.RolesControllerRemoveProjectRolePermissions.PathParameters> | null,
      data?: Paths.RolesControllerRemoveProjectRolePermissions.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerRemoveProjectRolePermissions.Responses.$200>
  }
  ['/api/v1/roles/project-roles']: {
    /**
     * RolesController_createProjectRole - 创建项目角色
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.RolesControllerCreateProjectRole.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerCreateProjectRole.Responses.$201>
  }
  ['/api/v1/roles/project-roles/{id}']: {
    /**
     * RolesController_updateProjectRole - 更新项目角色
     */
    'patch'(
      parameters?: Parameters<Paths.RolesControllerUpdateProjectRole.PathParameters> | null,
      data?: Paths.RolesControllerUpdateProjectRole.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerUpdateProjectRole.Responses.$200>
    /**
     * RolesController_deleteProjectRole - 删除项目角色
     */
    'delete'(
      parameters?: Parameters<Paths.RolesControllerDeleteProjectRole.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.RolesControllerDeleteProjectRole.Responses.$200>
  }
  ['/api/v1/audit/logs']: {
    /**
     * AuditLogController_findAll - 查询审计日志
     */
    'get'(
      parameters?: Parameters<Paths.AuditLogControllerFindAll.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuditLogControllerFindAll.Responses.$200>
  }
  ['/api/v1/audit/logs/{id}']: {
    /**
     * AuditLogController_findOne - 获取审计日志详情
     */
    'get'(
      parameters?: Parameters<Paths.AuditLogControllerFindOne.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuditLogControllerFindOne.Responses.$200>
  }
  ['/api/v1/audit/statistics']: {
    /**
     * AuditLogController_getStatistics - 获取审计统计信息
     */
    'get'(
      parameters?: Parameters<Paths.AuditLogControllerGetStatistics.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuditLogControllerGetStatistics.Responses.$200>
  }
  ['/api/v1/audit/cleanup']: {
    /**
     * AuditLogController_cleanupOldLogs - 清理旧审计日志
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AuditLogControllerCleanupOldLogs.Responses.$200>
  }
  ['/api/v1/file-system/projects']: {
    /**
     * FileSystemController_createProject - 创建项目
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerCreateProject.Responses.$201>
    /**
     * FileSystemController_getProjects - 获取项目列表
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetProjects.Responses.$200>
  }
  ['/api/v1/file-system/personal-space']: {
    /**
     * FileSystemController_getPersonalSpace - 获取当前用户的私人空间
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetPersonalSpace.Responses.$200>
  }
  ['/api/v1/file-system/projects/{projectId}']: {
    /**
     * FileSystemController_getProject - 获取项目详情
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetProject.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetProject.Responses.$200>
  }
  ['/api/v1/file-system/trash']: {
    /**
     * FileSystemController_getTrash - 获取回收站列表
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetTrash.Responses.$200>
    /**
     * FileSystemController_clearTrash - 清空回收站
     */
    'delete'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerClearTrash.Responses.$200>
  }
  ['/api/v1/file-system/trash/restore']: {
    /**
     * FileSystemController_restoreTrashItems - 恢复回收站项目
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerRestoreTrashItems.Responses.$200>
  }
  ['/api/v1/file-system/trash/items']: {
    /**
     * FileSystemController_permanentlyDeleteTrashItems - 永久删除回收站项目
     */
    'delete'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerPermanentlyDeleteTrashItems.Responses.$200>
  }
  ['/api/v1/file-system/nodes']: {
    /**
     * FileSystemController_createNode - 创建节点（文件或文件夹）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerCreateNode.Responses.$201>
  }
  ['/api/v1/file-system/nodes/{parentId}/folders']: {
    /**
     * FileSystemController_createFolder - 创建文件夹
     */
    'post'(
      parameters?: Parameters<Paths.FileSystemControllerCreateFolder.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerCreateFolder.Responses.$201>
  }
  ['/api/v1/file-system/nodes/{nodeId}/root']: {
    /**
     * FileSystemController_getRootNode - 获取节点的根节点
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetRootNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetRootNode.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/restore']: {
    /**
     * FileSystemController_restoreNode - 恢复单个节点
     */
    'post'(
      parameters?: Parameters<Paths.FileSystemControllerRestoreNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerRestoreNode.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}']: {
    /**
     * FileSystemController_getNode - 获取节点详情
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetNode.Responses.$200>
    /**
     * FileSystemController_updateNode - 更新节点
     */
    'patch'(
      parameters?: Parameters<Paths.FileSystemControllerUpdateNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerUpdateNode.Responses.$200>
    /**
     * FileSystemController_deleteNode - 删除节点
     */
    'delete'(
      parameters?: Parameters<Paths.FileSystemControllerDeleteNode.QueryParameters & Paths.FileSystemControllerDeleteNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerDeleteNode.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/children']: {
    /**
     * FileSystemController_getChildren - 获取子节点列表
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetChildren.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetChildren.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/move']: {
    /**
     * FileSystemController_moveNode - 移动节点
     */
    'post'(
      parameters?: Parameters<Paths.FileSystemControllerMoveNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerMoveNode.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/copy']: {
    /**
     * FileSystemController_copyNode - 复制节点
     */
    'post'(
      parameters?: Parameters<Paths.FileSystemControllerCopyNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerCopyNode.Responses.$201>
  }
  ['/api/v1/file-system/quota']: {
    /**
     * FileSystemController_getStorageQuota - 获取存储配额信息
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetStorageQuota.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetStorageQuota.Responses.$200>
  }
  ['/api/v1/file-system/quota/update']: {
    /**
     * FileSystemController_updateStorageQuota - 更新节点存储配额
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerUpdateStorageQuota.Responses.$200>
  }
  ['/api/v1/file-system/projects/{projectId}/members']: {
    /**
     * FileSystemController_getProjectMembers - 获取项目成员列表
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetProjectMembers.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetProjectMembers.Responses.$200>
    /**
     * FileSystemController_addProjectMember - 添加项目成员
     */
    'post'(
      parameters?: Parameters<Paths.FileSystemControllerAddProjectMember.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerAddProjectMember.Responses.$201>
  }
  ['/api/v1/file-system/projects/{projectId}/members/{userId}']: {
    /**
     * FileSystemController_updateProjectMember - 更新项目成员角色
     */
    'patch'(
      parameters?: Parameters<Paths.FileSystemControllerUpdateProjectMember.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerUpdateProjectMember.Responses.$200>
    /**
     * FileSystemController_removeProjectMember - 移除项目成员
     */
    'delete'(
      parameters?: Parameters<Paths.FileSystemControllerRemoveProjectMember.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerRemoveProjectMember.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/thumbnail']: {
    /**
     * FileSystemController_getThumbnail - 获取文件节点缩略图
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetThumbnail.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetThumbnail.Responses.$200 | Paths.FileSystemControllerGetThumbnail.Responses.$204>
  }
  ['/api/v1/file-system/nodes/{nodeId}/download']: {
    /**
     * FileSystemController_downloadNodeOptions - 下载接口 OPTIONS 预检
     */
    'options'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerDownloadNodeOptions.Responses.$200>
    /**
     * FileSystemController_downloadNode - 下载节点（文件或目录）
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerDownloadNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerDownloadNode.Responses.$200>
  }
  ['/api/v1/file-system/nodes/{nodeId}/download-with-format']: {
    /**
     * FileSystemController_downloadNodeWithFormat - 下载节点（支持多格式转换）
     * 
     * 支持下载 CAD 文件的多种格式：DWG、MXWEB、PDF。对于 PDF 格式，可以自定义宽度、高度和颜色策略。
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerDownloadNodeWithFormat.QueryParameters & Paths.FileSystemControllerDownloadNodeWithFormat.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerDownloadNodeWithFormat.Responses.$200>
  }
  ['/api/v1/file-system/projects/{projectId}/permissions']: {
    /**
     * FileSystemController_getUserProjectPermissions - 获取用户在项目中的权限列表
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetUserProjectPermissions.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetUserProjectPermissions.Responses.$200>
  }
  ['/api/v1/file-system/projects/{projectId}/permissions/check']: {
    /**
     * FileSystemController_checkProjectPermission - 检查用户是否具有特定权限
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerCheckProjectPermission.QueryParameters & Paths.FileSystemControllerCheckProjectPermission.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerCheckProjectPermission.Responses.$200>
  }
  ['/api/v1/file-system/projects/{projectId}/role']: {
    /**
     * FileSystemController_getUserProjectRole - 获取用户在项目中的角色
     */
    'get'(
      parameters?: Parameters<Paths.FileSystemControllerGetUserProjectRole.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerGetUserProjectRole.Responses.$200>
  }
  ['/api/v1/file-system/search']: {
    /**
     * FileSystemController_search - 统一搜索接口
     * 
     * 支持多种搜索范围：
     * - project: 搜索项目列表
     * - project_files: 搜索指定项目内的文件（需提供 projectId）
     * - all_projects: 搜索所有有权限访问的项目中的文件
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FileSystemControllerSearch.Responses.$200>
  }
  ['/api/v1/version-control/history']: {
    /**
     * VersionControlController_getFileHistory - 获取节点的 SVN 提交历史
     */
    'get'(
      parameters?: Parameters<Paths.VersionControlControllerGetFileHistory.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.VersionControlControllerGetFileHistory.Responses.$200>
  }
  ['/api/v1/version-control/file/{revision}']: {
    /**
     * VersionControlController_getFileContentAtRevision - 获取指定版本的文件内容
     */
    'get'(
      parameters?: Parameters<Paths.VersionControlControllerGetFileContentAtRevision.QueryParameters & Paths.VersionControlControllerGetFileContentAtRevision.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.VersionControlControllerGetFileContentAtRevision.Responses.$200>
  }
  ['/api/v1/font-management']: {
    /**
     * FontsController_getFonts - 获取字体列表
     * 
     * 获取所有字体文件，前端负责分页、筛选和排序
     */
    'get'(
      parameters?: Parameters<Paths.FontsControllerGetFonts.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FontsControllerGetFonts.Responses.$200>
  }
  ['/api/v1/font-management/upload']: {
    /**
     * FontsController_uploadFont - 上传字体文件
     * 
     * 上传字体文件到指定目录
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.FontsControllerUploadFont.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FontsControllerUploadFont.Responses.$201>
  }
  ['/api/v1/font-management/{fileName}']: {
    /**
     * FontsController_deleteFont - 删除字体文件
     * 
     * 从指定目录删除字体文件
     */
    'delete'(
      parameters?: Parameters<Paths.FontsControllerDeleteFont.QueryParameters & Paths.FontsControllerDeleteFont.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FontsControllerDeleteFont.Responses.$200>
  }
  ['/api/v1/font-management/download/{fileName}']: {
    /**
     * FontsController_downloadFont - 下载字体文件
     * 
     * 下载指定位置的字体文件
     */
    'get'(
      parameters?: Parameters<Paths.FontsControllerDownloadFont.QueryParameters & Paths.FontsControllerDownloadFont.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.FontsControllerDownloadFont.Responses.$200>
  }
  ['/api/v1/mxcad/files/chunkisExist']: {
    /**
     * MxCadController_checkChunkExist
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerCheckChunkExist.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerCheckChunkExist.Responses.$200>
  }
  ['/api/v1/mxcad/files/fileisExist']: {
    /**
     * MxCadController_checkFileExist
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerCheckFileExist.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerCheckFileExist.Responses.$200>
  }
  ['/api/v1/mxcad/files/checkDuplicate']: {
    /**
     * MxCadController_checkDuplicateFile - 检查目录中是否存在重复文件
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerCheckDuplicateFile.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerCheckDuplicateFile.Responses.$200>
  }
  ['/api/v1/mxcad/file/{nodeId}/preloading']: {
    /**
     * MxCadController_getPreloadingData
     */
    'get'(
      parameters?: Parameters<Paths.MxCadControllerGetPreloadingData.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetPreloadingData.Responses.$200>
  }
  ['/api/v1/mxcad/file/{nodeId}/check-reference']: {
    /**
     * MxCadController_checkExternalReference
     */
    'post'(
      parameters?: Parameters<Paths.MxCadControllerCheckExternalReference.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerCheckExternalReference.Responses.$200>
  }
  ['/api/v1/mxcad/file/{nodeId}/refresh-external-references']: {
    /**
     * MxCadController_refreshExternalReferences
     */
    'post'(
      parameters?: Parameters<Paths.MxCadControllerRefreshExternalReferences.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerRefreshExternalReferences.Responses.$200>
  }
  ['/api/v1/mxcad/files/uploadFiles']: {
    /**
     * MxCadController_uploadFile
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerUploadFile.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerUploadFile.Responses.$200>
  }
  ['/api/v1/mxcad/savemxweb/{nodeId}']: {
    /**
     * MxCadController_saveMxwebToNode
     */
    'post'(
      parameters?: Parameters<Paths.MxCadControllerSaveMxwebToNode.PathParameters> | null,
      data?: Paths.MxCadControllerSaveMxwebToNode.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerSaveMxwebToNode.Responses.$200>
  }
  ['/api/v1/mxcad/save-as']: {
    /**
     * MxCadController_saveMxwebAs
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerSaveMxwebAs.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerSaveMxwebAs.Responses.$200>
  }
  ['/api/v1/mxcad/up_ext_reference_dwg/{nodeId}']: {
    /**
     * MxCadController_uploadExtReferenceDwg
     */
    'post'(
      parameters?: Parameters<Paths.MxCadControllerUploadExtReferenceDwg.PathParameters> | null,
      data?: Paths.MxCadControllerUploadExtReferenceDwg.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerUploadExtReferenceDwg.Responses.$200>
  }
  ['/api/v1/mxcad/up_ext_reference_image']: {
    /**
     * MxCadController_uploadExtReferenceImage
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.MxCadControllerUploadExtReferenceImage.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerUploadExtReferenceImage.Responses.$200>
  }
  ['/api/v1/mxcad/filesData/{path}']: {
    /**
     * MxCadController_getFilesDataFile
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetFilesDataFile.Responses.$200>
    /**
     * MxCadController_getFilesDataFileHead
     */
    'head'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetFilesDataFileHead.Responses.$200>
  }
  ['/api/v1/mxcad/file/{path}']: {
    /**
     * MxCadController_getFile
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetFile.Responses.$200>
    /**
     * MxCadController_getFileHead
     */
    'head'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetFileHead.Responses.$200>
  }
  ['/api/v1/mxcad/thumbnail/{nodeId}']: {
    /**
     * MxCadController_checkThumbnail
     */
    'get'(
      parameters?: Parameters<Paths.MxCadControllerCheckThumbnail.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerCheckThumbnail.Responses.$200>
    /**
     * MxCadController_uploadThumbnail
     */
    'post'(
      parameters?: Parameters<Paths.MxCadControllerUploadThumbnail.PathParameters> | null,
      data?: Paths.MxCadControllerUploadThumbnail.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerUploadThumbnail.Responses.$200>
  }
  ['/api/v1/mxcad/files/{storageKey}']: {
    /**
     * MxCadController_getNonCadFile
     */
    'get'(
      parameters?: Parameters<Paths.MxCadControllerGetNonCadFile.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.MxCadControllerGetNonCadFile.Responses.$200>
  }
  ['/api/v1/admin/stats']: {
    /**
     * AdminController_getAdminStats - 获取管理员统计信息
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AdminControllerGetAdminStats.Responses.$200>
  }
  ['/api/v1/admin/storage/cleanup']: {
    /**
     * AdminController_cleanupStorage - 手动触发存储清理
     */
    'post'(
      parameters?: Parameters<Paths.AdminControllerCleanupStorage.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AdminControllerCleanupStorage.Responses.$200>
  }
  ['/api/v1/admin/storage/cleanup/stats']: {
    /**
     * AdminController_getCleanupStats - 获取待清理存储统计
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.AdminControllerGetCleanupStats.Responses.$200>
  }
  ['/api/v1/health/live']: {
    /**
     * HealthController_liveness - 存活检查（Docker 健康检查）
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthControllerLiveness.Responses.$200>
  }
  ['/api/v1/health']: {
    /**
     * HealthController_publicHealth - 服务健康检查（公开）
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthControllerPublicHealth.Responses.$200>
  }
  ['/api/v1/health/full']: {
    /**
     * HealthController_check - 系统健康检查（详细）
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthControllerCheck.Responses.$200>
  }
  ['/api/v1/health/db']: {
    /**
     * HealthController_checkDatabase - 数据库健康检查
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthControllerCheckDatabase.Responses.$200>
  }
  ['/api/v1/health/storage']: {
    /**
     * HealthController_checkStorage - 存储服务健康检查
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthControllerCheckStorage.Responses.$200>
  }
  ['/api/v1/public-file/chunk/check']: {
    /**
     * PublicFileController_checkChunk - 检查分片是否存在
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.PublicFileControllerCheckChunk.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerCheckChunk.Responses.$200>
  }
  ['/api/v1/public-file/file/check']: {
    /**
     * PublicFileController_checkFile - 检查文件是否已存在（秒传检查）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.PublicFileControllerCheckFile.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerCheckFile.Responses.$200>
  }
  ['/api/v1/public-file/chunk/upload']: {
    /**
     * PublicFileController_uploadChunk - 上传分片
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.PublicFileControllerUploadChunk.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerUploadChunk.Responses.$200>
  }
  ['/api/v1/public-file/chunk/merge']: {
    /**
     * PublicFileController_mergeChunks - 合并分片并获取文件访问信息
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.PublicFileControllerMergeChunks.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerMergeChunks.Responses.$200>
  }
  ['/api/v1/public-file/access/{hash}/{filename}']: {
    /**
     * PublicFileController_accessFile - 通过文件哈希访问目录下的文件
     */
    'get'(
      parameters?: Parameters<Paths.PublicFileControllerAccessFile.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<any>
  }
  ['/api/v1/public-file/ext-reference/upload']: {
    /**
     * PublicFileController_uploadExtReference - 上传外部参照文件（公开接口）
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.PublicFileControllerUploadExtReference.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerUploadExtReference.Responses.$200>
  }
  ['/api/v1/public-file/ext-reference/check']: {
    /**
     * PublicFileController_checkExtReference - 检查外部参照文件是否存在
     */
    'get'(
      parameters?: Parameters<Paths.PublicFileControllerCheckExtReference.QueryParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerCheckExtReference.Responses.$200>
  }
  ['/api/v1/public-file/preloading/{hash}']: {
    /**
     * PublicFileController_getPreloadingData - 获取预加载数据（包含外部参照信息）
     */
    'get'(
      parameters?: Parameters<Paths.PublicFileControllerGetPreloadingData.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublicFileControllerGetPreloadingData.Responses.$200>
  }
  ['/api/v1/library/drawing']: {
    /**
     * LibraryController_getDrawingLibrary - 获取图纸库详情
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetDrawingLibrary.Responses.$200>
  }
  ['/api/v1/library/drawing/children/{nodeId}']: {
    /**
     * LibraryController_getDrawingChildren - 获取图纸库子节点列表
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetDrawingChildren.QueryParameters & Paths.LibraryControllerGetDrawingChildren.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetDrawingChildren.Responses.$200>
  }
  ['/api/v1/library/drawing/all-files/{nodeId}']: {
    /**
     * LibraryController_getDrawingAllFiles - 递归获取图纸库节点下的所有文件
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetDrawingAllFiles.QueryParameters & Paths.LibraryControllerGetDrawingAllFiles.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetDrawingAllFiles.Responses.$200>
  }
  ['/api/v1/library/drawing/filesData/{path}']: {
    /**
     * LibraryController_getDrawingFile - 获取图纸库文件（统一入口）
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetDrawingFile.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<any>
  }
  ['/api/v1/library/drawing/nodes/{nodeId}']: {
    /**
     * LibraryController_getDrawingNode - 获取图纸库节点详情
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetDrawingNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetDrawingNode.Responses.$200>
  }
  ['/api/v1/library/drawing/nodes/{nodeId}/download']: {
    /**
     * LibraryController_downloadDrawingNode - 下载图纸库文件
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerDownloadDrawingNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerDownloadDrawingNode.Responses.$200>
  }
  ['/api/v1/library/drawing/nodes/{nodeId}/thumbnail']: {
    /**
     * LibraryController_getDrawingThumbnail - 获取图纸库文件缩略图
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetDrawingThumbnail.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetDrawingThumbnail.Responses.$200>
  }
  ['/api/v1/library/block']: {
    /**
     * LibraryController_getBlockLibrary - 获取图块库详情
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetBlockLibrary.Responses.$200>
  }
  ['/api/v1/library/block/children/{nodeId}']: {
    /**
     * LibraryController_getBlockChildren - 获取图块库子节点列表
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetBlockChildren.QueryParameters & Paths.LibraryControllerGetBlockChildren.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetBlockChildren.Responses.$200>
  }
  ['/api/v1/library/block/all-files/{nodeId}']: {
    /**
     * LibraryController_getBlockAllFiles - 递归获取图块库节点下的所有文件
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetBlockAllFiles.QueryParameters & Paths.LibraryControllerGetBlockAllFiles.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetBlockAllFiles.Responses.$200>
  }
  ['/api/v1/library/block/filesData/{path}']: {
    /**
     * LibraryController_getBlockFile - 获取图块库文件（统一入口）
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetBlockFile.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<any>
  }
  ['/api/v1/library/block/nodes/{nodeId}']: {
    /**
     * LibraryController_getBlockNode - 获取图块库节点详情
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetBlockNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetBlockNode.Responses.$200>
  }
  ['/api/v1/library/block/nodes/{nodeId}/download']: {
    /**
     * LibraryController_downloadBlockNode - 下载图块库文件
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerDownloadBlockNode.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerDownloadBlockNode.Responses.$200>
  }
  ['/api/v1/library/block/nodes/{nodeId}/thumbnail']: {
    /**
     * LibraryController_getBlockThumbnail - 获取图块库文件缩略图
     */
    'get'(
      parameters?: Parameters<Paths.LibraryControllerGetBlockThumbnail.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.LibraryControllerGetBlockThumbnail.Responses.$200>
  }
}

export type Client = OpenAPIClient<OperationMethods, PathsDictionary>


export type AdminStatsResponseDto = Components.Schemas.AdminStatsResponseDto;
export type AllPermissionsEnum = Components.Schemas.AllPermissionsEnum;
export type AuthApiResponseDto = Components.Schemas.AuthApiResponseDto;
export type AuthResponseDto = Components.Schemas.AuthResponseDto;
export type BatchCacheOperationDto = Components.Schemas.BatchCacheOperationDto;
export type BatchOperationResponseDto = Components.Schemas.BatchOperationResponseDto;
export type BindEmailApiResponseDto = Components.Schemas.BindEmailApiResponseDto;
export type BindEmailResponseDto = Components.Schemas.BindEmailResponseDto;
export type CacheCleanupDto = Components.Schemas.CacheCleanupDto;
export type CacheMonitoringSummaryDto = Components.Schemas.CacheMonitoringSummaryDto;
export type CacheRefreshDto = Components.Schemas.CacheRefreshDto;
export type CacheWarmupConfigDto = Components.Schemas.CacheWarmupConfigDto;
export type CacheWarningsDto = Components.Schemas.CacheWarningsDto;
export type CadDownloadFormat = Components.Schemas.CadDownloadFormat;
export type ChangePasswordApiResponseDto = Components.Schemas.ChangePasswordApiResponseDto;
export type ChangePasswordDto = Components.Schemas.ChangePasswordDto;
export type ChangePasswordResponseDto = Components.Schemas.ChangePasswordResponseDto;
export type CheckChunkDto = Components.Schemas.CheckChunkDto;
export type CheckChunkExistDto = Components.Schemas.CheckChunkExistDto;
export type CheckChunkResponseDto = Components.Schemas.CheckChunkResponseDto;
export type CheckDuplicateFileDto = Components.Schemas.CheckDuplicateFileDto;
export type CheckDuplicateFileResponseDto = Components.Schemas.CheckDuplicateFileResponseDto;
export type CheckFileDto = Components.Schemas.CheckFileDto;
export type CheckFileExistDto = Components.Schemas.CheckFileExistDto;
export type CheckFileResponseDto = Components.Schemas.CheckFileResponseDto;
export type CheckReferenceResponseDto = Components.Schemas.CheckReferenceResponseDto;
export type CheckThumbnailResponseDto = Components.Schemas.CheckThumbnailResponseDto;
export type ChunkExistResponseDto = Components.Schemas.ChunkExistResponseDto;
export type CreateProjectRoleDto = Components.Schemas.CreateProjectRoleDto;
export type CreateRoleDto = Components.Schemas.CreateRoleDto;
export type CreateUserDto = Components.Schemas.CreateUserDto;
export type DeactivateAccountApiResponseDto = Components.Schemas.DeactivateAccountApiResponseDto;
export type DeactivateAccountDto = Components.Schemas.DeactivateAccountDto;
export type DeactivateAccountResponseDto = Components.Schemas.DeactivateAccountResponseDto;
export type ExternalReferenceStatsDto = Components.Schemas.ExternalReferenceStatsDto;
export type FileContentResponseDto = Components.Schemas.FileContentResponseDto;
export type FileExistResponseDto = Components.Schemas.FileExistResponseDto;
export type FileStatus = Components.Schemas.FileStatus;
export type FileStatusEnum = Components.Schemas.FileStatusEnum;
export type FileSystemNodeDto = Components.Schemas.FileSystemNodeDto;
export type FileTypeStatsDto = Components.Schemas.FileTypeStatsDto;
export type FontUploadTarget = Components.Schemas.FontUploadTarget;
export type ForgotPasswordApiResponseDto = Components.Schemas.ForgotPasswordApiResponseDto;
export type ForgotPasswordDto = Components.Schemas.ForgotPasswordDto;
export type ForgotPasswordResponseDto = Components.Schemas.ForgotPasswordResponseDto;
export type LoginDto = Components.Schemas.LoginDto;
export type MergeChunksDto = Components.Schemas.MergeChunksDto;
export type MergeCompleteResponseDto = Components.Schemas.MergeCompleteResponseDto;
export type NodeListResponseDto = Components.Schemas.NodeListResponseDto;
export type NodeTreeResponseDto = Components.Schemas.NodeTreeResponseDto;
export type OperationSuccessDto = Components.Schemas.OperationSuccessDto;
export type PerformanceTrendDto = Components.Schemas.PerformanceTrendDto;
export type Permission = Components.Schemas.Permission;
export type PermissionCheckResponseDto = Components.Schemas.PermissionCheckResponseDto;
export type PermissionsDto = Components.Schemas.PermissionsDto;
export type PreloadingDataDto = Components.Schemas.PreloadingDataDto;
export type ProjectDto = Components.Schemas.ProjectDto;
export type ProjectListResponseDto = Components.Schemas.ProjectListResponseDto;
export type ProjectMemberDto = Components.Schemas.ProjectMemberDto;
export type ProjectPermission = Components.Schemas.ProjectPermission;
export type ProjectPermissionEnum = Components.Schemas.ProjectPermissionEnum;
export type ProjectRoleDto = Components.Schemas.ProjectRoleDto;
export type ProjectRolePermissionDto = Components.Schemas.ProjectRolePermissionDto;
export type ProjectStatusEnum = Components.Schemas.ProjectStatusEnum;
export type ProjectUserPermissionsDto = Components.Schemas.ProjectUserPermissionsDto;
export type RefreshExternalReferencesResponseDto = Components.Schemas.RefreshExternalReferencesResponseDto;
export type RefreshTokenDto = Components.Schemas.RefreshTokenDto;
export type RegisterDto = Components.Schemas.RegisterDto;
export type ResetPasswordApiResponseDto = Components.Schemas.ResetPasswordApiResponseDto;
export type ResetPasswordDto = Components.Schemas.ResetPasswordDto;
export type ResetPasswordResponseDto = Components.Schemas.ResetPasswordResponseDto;
export type RestoreAccountDto = Components.Schemas.RestoreAccountDto;
export type RestoreAccountResponseDto = Components.Schemas.RestoreAccountResponseDto;
export type RoleCategory = Components.Schemas.RoleCategory;
export type RoleCategoryEnum = Components.Schemas.RoleCategoryEnum;
export type RoleDto = Components.Schemas.RoleDto;
export type RuntimeConfigDefinitionDto = Components.Schemas.RuntimeConfigDefinitionDto;
export type RuntimeConfigResponseDto = Components.Schemas.RuntimeConfigResponseDto;
export type SaveMxwebAsDto = Components.Schemas.SaveMxwebAsDto;
export type SaveMxwebAsResponseDto = Components.Schemas.SaveMxwebAsResponseDto;
export type SaveMxwebDto = Components.Schemas.SaveMxwebDto;
export type SaveMxwebResponseDto = Components.Schemas.SaveMxwebResponseDto;
export type SendVerificationApiResponseDto = Components.Schemas.SendVerificationApiResponseDto;
export type SendVerificationResponseDto = Components.Schemas.SendVerificationResponseDto;
export type SizeTrendDto = Components.Schemas.SizeTrendDto;
export type StorageInfoDto = Components.Schemas.StorageInfoDto;
export type StorageQuotaTypeEnum = Components.Schemas.StorageQuotaTypeEnum;
export type SvnLogEntryDto = Components.Schemas.SvnLogEntryDto;
export type SvnLogPathDto = Components.Schemas.SvnLogPathDto;
export type SvnLogResponseDto = Components.Schemas.SvnLogResponseDto;
export type SystemPermission = Components.Schemas.SystemPermission;
export type TrashListResponseDto = Components.Schemas.TrashListResponseDto;
export type TriggerWarmupDto = Components.Schemas.TriggerWarmupDto;
export type UpdateProjectRoleDto = Components.Schemas.UpdateProjectRoleDto;
export type UpdateRoleDto = Components.Schemas.UpdateRoleDto;
export type UpdateRuntimeConfigDto = Components.Schemas.UpdateRuntimeConfigDto;
export type UpdateUserDto = Components.Schemas.UpdateUserDto;
export type UpdateWarmupConfigDto = Components.Schemas.UpdateWarmupConfigDto;
export type UploadChunkDto = Components.Schemas.UploadChunkDto;
export type UploadChunkResponseDto = Components.Schemas.UploadChunkResponseDto;
export type UploadExtReferenceDto = Components.Schemas.UploadExtReferenceDto;
export type UploadExtReferenceFileDto = Components.Schemas.UploadExtReferenceFileDto;
export type UploadFileResponseDto = Components.Schemas.UploadFileResponseDto;
export type UploadFilesDto = Components.Schemas.UploadFilesDto;
export type UploadFontDto = Components.Schemas.UploadFontDto;
export type UploadThumbnailDataDto = Components.Schemas.UploadThumbnailDataDto;
export type UploadThumbnailDto = Components.Schemas.UploadThumbnailDto;
export type UploadThumbnailResponseDto = Components.Schemas.UploadThumbnailResponseDto;
export type UserCleanupStatsResponseDto = Components.Schemas.UserCleanupStatsResponseDto;
export type UserCleanupTriggerDto = Components.Schemas.UserCleanupTriggerDto;
export type UserCleanupTriggerResponseDto = Components.Schemas.UserCleanupTriggerResponseDto;
export type UserDashboardStatsDto = Components.Schemas.UserDashboardStatsDto;
export type UserDto = Components.Schemas.UserDto;
export type UserListResponseDto = Components.Schemas.UserListResponseDto;
export type UserProfileResponseDto = Components.Schemas.UserProfileResponseDto;
export type UserResponseDto = Components.Schemas.UserResponseDto;
export type UserRoleDto = Components.Schemas.UserRoleDto;
export type UserSearchResultDto = Components.Schemas.UserSearchResultDto;
export type UserStatusEnum = Components.Schemas.UserStatusEnum;
export type VerifyBindEmailDto = Components.Schemas.VerifyBindEmailDto;
export type VerifyEmailDto = Components.Schemas.VerifyEmailDto;
export type WarmupHistoryDto = Components.Schemas.WarmupHistoryDto;
export type WarmupResponseDto = Components.Schemas.WarmupResponseDto;
export type WarmupStatsDto = Components.Schemas.WarmupStatsDto;
