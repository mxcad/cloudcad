/**
 * 批量替换后端中文消息为 i18n key 的迁移脚本
 *
 * 运行方式: node scripts/migrate-i18n.mjs
 *
 * 功能:
 * 1. 扫描 packages/backend/src 下所有 .ts 文件
 * 2. 找到异常构造函数中的中文字符串 (如 new BadRequestException('中文消息'))
 * 3. 替换为 I18nContext.current()?.t('key') ?? '原中文消息'
 * 4. 自动添加 import { I18nContext } from 'nestjs-i18n'
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_SRC = path.resolve(__dirname, '..', 'src');

// ─── 中文消息 → i18n key 映射表 ─────────────────────────────
// 从 zh-CN YAML 翻译文件提取
const MAPPING = {
  // ===== error.general =====
  '服务器内部错误': 'error.general.internal_server_error',
  '业务处理失败': 'error.general.operation_failed',
  '服务器繁忙，请稍后重试': 'error.general.server_busy',
  '请求的资源不存在': 'error.resource.not_found',
  '缺少项目ID参数': 'error.resource.missing_project_id',

  // ===== error.auth =====
  '未登录或登录已过期': 'error.auth.login_expired',
  'Token已被撤销': 'error.auth.token_revoked',
  'Token验证失败': 'error.auth.token_invalid',
  '账号或密码错误': 'error.auth.invalid_credentials',
  '账号已被注销': 'error.auth.account_deactivated',
  '用户已被禁用': 'error.auth.user_disabled',
  '用户不存在或已被禁用': 'error.auth.user_not_found_or_disabled',
  '无效的刷新Token类型': 'error.auth.refresh_token_invalid_type',
  '系统已关闭注册功能': 'error.auth.registration_disabled',
  '未登录': 'error.auth.not_logged_in',
  '请先登录': 'error.auth.login_required',
  '登录已过期，正在跳转到登录页...': 'error.auth.login_expired_redirect',
  '需要登录才能使用协同功能': 'error.auth.collaboration_login_required',
  '用户未认证': 'error.auth.unauthorized',
  '身份验证失败': 'error.auth.authentication_failed',
  '缺少Authorization header': 'error.auth.missing_auth_header',
  'JWT token无效或已过期': 'error.auth.jwt_invalid',
  '您没有权限执行此操作': 'error.auth.permission_denied',
  '权限不足': 'error.auth.permission_insufficient',
  '邮箱已被注册': 'error.auth.email_already_registered',
  '用户名已被使用': 'error.auth.username_already_taken',
  '该微信已绑定其他账号': 'error.auth.wechat_already_bound',
  '无效的微信临时 Token': 'error.auth.wechat_token_invalid',
  '邮箱验证已启用，注册需要提供邮箱地址': 'error.auth.email_required_for_registration',
  '邮箱和手机号不能同时为空': 'error.auth.email_or_phone_required',
  '该邮箱未注册': 'error.auth.email_not_registered',
  '该手机号未注册': 'error.auth.phone_not_registered',
  '账号已被禁用，无法重置密码': 'error.auth.account_disabled_cannot_reset',
  '无效的刷新Token': 'error.auth.refresh_token_invalid',
  '刷新Token无效或已过期': 'error.auth.refresh_token_expired',
  '登出失败': 'error.auth.logout_failed',
  '无效的Token': 'error.auth.token_invalid',
  'Token存储失败': 'error.auth.token_storage_failed',
  '删除刷新Token失败': 'error.auth.delete_refresh_token_failed',
  '用户不存在': 'error.auth.user_not_found',
  '请输入当前密码': 'error.auth.password_required',
  '当前密码不正确': 'error.auth.password_incorrect',
  '发送验证码失败，请稍后重试': 'error.auth.send_code_failed',
  '发送过于频繁，请稍后再试': 'error.auth.send_too_frequent',
  '验证码无效或已过期': 'error.auth.verification_code_invalid',
  '验证次数已用完，请重新获取验证码': 'error.auth.verification_attempts_exhausted',
  '手机号格式不正确': 'error.auth.phone_format_invalid',
  '该手机号今日发送次数已达上限（N次），请明天再试': 'error.auth.phone_too_many_today',
  '当前网络发送次数已达上限，请稍后再试': 'error.auth.phone_network_limit',
  '腾讯云短信配置缺失': 'error.auth.tencent_sms_config_missing',
  '阿里云短信配置缺失': 'error.auth.aliyun_sms_config_missing',
  '微信 AppID 未配置，请在 .env 文件中设置 WECHAT_APP_ID': 'error.auth.wechat_appid_missing',
  '微信授权失败': 'error.auth.wechat_auth_failed',
  '微信授权服务异常': 'error.auth.wechat_auth_service_error',
  '微信用户信息服务异常': 'error.auth.wechat_user_info_error',
  '刷新授权失败': 'error.auth.wechat_refresh_failed',
  '请求过于频繁，请稍后再试': 'error.rate_limit.too_many_requests',

  // ===== error.account_binding =====
  '邮件服务未启用，无法绑定邮箱': 'error.account_binding.email_service_disabled',
  '您已绑定邮箱，如需更换请联系管理员': 'error.account_binding.email_already_bound',
  '该邮箱已被其他用户绑定': 'error.account_binding.email_conflict',
  '该手机号已被其他用户绑定': 'error.account_binding.phone_conflict',
  '短信服务未启用': 'error.account_binding.sms_service_disabled',
  '您还未绑定手机号': 'error.account_binding.phone_not_bound',
  '您还未绑定邮箱': 'error.account_binding.email_not_bound',
  '验证 token 无效': 'error.account_binding.verify_token_invalid',
  '验证 token 无效或已过期': 'error.account_binding.verify_token_expired',
  '邮件服务未启用': 'error.account_binding.email_service_disabled_general',
  '未绑定微信': 'error.account_binding.wechat_not_bound',
  '无效的状态参数': 'error.account_binding.invalid_state_param',
  '至少需要保留一种登录方式（设置密码、绑定邮箱或绑定手机）': 'error.account_binding.keep_one_login_method_password_email_phone',
  '至少需要保留一种登录方式（设置密码、绑定手机或绑定微信）': 'error.account_binding.keep_one_login_method_password_phone_wechat',
  '至少需要保留一种登录方式（设置密码、绑定邮箱或绑定微信）': 'error.account_binding.keep_one_login_method_password_email_wechat',

  // ===== error.user =====
  '用户不存在': 'error.user.not_found',
  '用户已注销': 'error.user.deactivated',
  '账户已注销': 'error.user.already_deactivated',
  '不能删除管理员账户': 'error.user.cannot_delete_admin',
  '用户未注销，无法恢复': 'error.user.not_deactivated_cannot_restore',
  '账户未注销，无需恢复': 'error.user.already_deactivated_cannot_restore',
  '已过冷静期，无法恢复': 'error.user.past_cooling_period',
  '验证方式无效': 'error.user.invalid_verification_method',
  '请选择一种验证方式': 'error.user.select_verification_method',
  '用户名一月内只能修改3次': 'error.user.username_change_limit',
  '邮箱验证已启用，邮箱为必填项': 'error.user.email_required',
  '邮箱已存在': 'error.user.email_exists',
  '用户名已存在': 'error.user.username_exists',
  '手机号已存在': 'error.user.phone_exists',
  '默认角色不存在，请联系管理员': 'error.user.default_role_not_found',
  'PROJECT_OWNER 角色不存在': 'error.user.project_owner_role_not_found',
  '您不是该项目的成员': 'error.user.not_project_member',
  '用户创建失败': 'error.user.create_failed',
  '默认角色不存在': 'error.user.default_role_missing',
  '该账户未设置密码': 'error.user.no_password_set',
  '该账户未绑定手机': 'error.user.no_phone_bound',
  '该账户未绑定邮箱': 'error.user.no_email_bound',
  '验证条件不满足': 'error.user.verification_failed_generic',
  '密码不正确': 'error.user.password_incorrect_verify',
  '验证码不正确': 'error.user.verification_code_incorrect',
  '邮箱验证码不正确或已过期': 'error.user.email_code_incorrect_or_expired',
  '验证失败': 'error.user.verification_failed_default',
  '该账户未设置密码，请选择其他验证方式': 'error.user.no_password_choose_other',
  '该账户未绑定手机，请选择其他验证方式': 'error.user.no_phone_choose_other',
  '该账户未绑定邮箱，请选择其他验证方式': 'error.user.no_email_choose_other',
  '该账户未绑定微信，请选择其他验证方式': 'error.user.no_wechat_choose_other',
  '微信验证失败': 'error.user.wechat_verification_failed',

  // ===== error.project =====
  '项目不存在': 'error.project.not_found',
  '已存在同名项目，请使用其他名称': 'error.project.already_exists',

  // ===== error.project_member =====
  '无权限添加项目成员': 'error.project_member.no_permission_add',
  '私人空间不支持添加成员操作': 'error.project_member.private_space_no_add',
  '角色不存在': 'error.project_member.role_not_found',
  '用户已经是项目成员': 'error.project_member.already_member',
  '无权限修改成员角色': 'error.project_member.no_permission_update_role',
  '私人空间不支持更新成员操作': 'error.project_member.private_space_no_update',
  '不能修改项目所有者的角色': 'error.project_member.cannot_modify_owner_role',
  '成员不存在': 'error.project_member.member_not_found',
  '无权限移除项目成员': 'error.project_member.no_permission_remove',
  '私人空间不支持移除成员操作': 'error.project_member.private_space_no_remove',
  '不能移除项目所有者': 'error.project_member.cannot_remove_owner',
  '私人空间不支持转让操作': 'error.project_member.private_space_no_transfer',
  '只有项目所有者可以转让项目': 'error.project_member.only_owner_can_transfer',
  '不能转让给自己': 'error.project_member.cannot_transfer_to_self',
  '转让目标必须是项目成员': 'error.project_member.transfer_target_must_be_member',
  '项目所有者角色不存在': 'error.project_member.owner_role_not_found',
  'PROJECT_ADMIN 和 PROJECT_MEMBER 角色均不存在，请检查系统初始化': 'error.project_member.roles_missing',
  '私人空间不支持批量添加成员操作': 'error.project_member.private_space_no_batch_add',
  '私人空间不支持批量更新成员操作': 'error.project_member.private_space_no_batch_update',

  // ===== error.file =====
  '文件不存在': 'error.file.not_found',
  '文件节点不存在': 'error.file.node_not_found',
  '父节点不存在': 'error.file.parent_not_found',
  '目标父节点不存在': 'error.file.target_parent_not_found',
  '父节点必须是文件夹': 'error.file.parent_must_be_folder',
  '未找到根节点': 'error.file.root_not_found',
  '文件名不能为空': 'error.file.name_empty',
  '无效的文件名': 'error.file.name_invalid',
  '文件名包含非法字符': 'error.file.name_illegal_chars',
  '文件名过长': 'error.file.name_too_long',
  '文件名不能仅为点号': 'error.file.name_dot_only',
  '文件名清理失败': 'error.file.name_sanitize_failed',
  '清理后的文件名仍包含路径字符': 'error.file.name_sanitize_contains_path',
  '清理后的文件名不能以点开头': 'error.file.name_sanitize_starts_with_dot',
  '清理后的文件名包含前导或尾随空格': 'error.file.name_sanitize_has_spaces',
  'Windows 保留文件名': 'error.file.name_windows_reserved',
  '文件名包含危险字符': 'error.file.name_dangerous_chars',
  '清理后的文件名为空': 'error.file.name_sanitized_empty',
  '路径不能为空': 'error.file.path_empty',
  '路径包含非法字符': 'error.file.path_illegal_chars',
  '路径不在允许的目录内': 'error.file.path_out_of_bounds',
  '无效的文件路径': 'error.file.path_invalid',
  '禁止上传 {extension} 类型文件': 'error.file.extension_forbidden',
  '文件魔数验证失败': 'error.file.magic_number_failed',
  'DWG 文件太小，可能已损坏': 'error.file.dwg_too_small',
  'DXF 文件缺少必需的 DXF 标记，可能已损坏': 'error.file.dxf_missing_marker',
  '未找到源图纸': 'error.file.not_found_source',
  '没有文件访问权限': 'error.file.no_access',
  '无权限访问该图纸': 'error.file.no_access_drawing',
  '权限验证失败': 'error.file.permission_verification_failed',
  '文件已被他人修改，请刷新后重试': 'error.file.already_modified',
  '文件尚未转换完成': 'error.file.conversion_incomplete',
  '文件转换失败': 'error.file.conversion_failed',
  '不支持的文件格式': 'error.file.format_unsupported',
  '文件大小超出限制': 'error.file.size_exceeded',
  '文件数量超过限制': 'error.file.count_exceeded',
  '文件下载失败': 'error.file.download_failed',
  '文件上传失败': 'error.file.upload_failed',
  '缺少上传文件': 'error.file.upload_missing',
  '上传文件不存在': 'error.file.upload_file_not_found',
  '缺少必要参数': 'error.file.missing_required_params',
  '缺少文件': 'error.file.missing_file',
  '历史版本目录不存在': 'error.file.version_history_not_found',
  '历史版本原始文件不存在': 'error.file.history_file_not_found',
  '历史版本文件转换失败': 'error.file.history_conversion_failed',
  '文件流错误': 'error.file.file_stream_error',
  '访问文件失败': 'error.file.access_failed',
  '获取文件失败': 'error.file.fetch_failed',
  '获取历史版本文件失败': 'error.file.fetch_history_failed',
  '图片文件拷贝失败': 'error.file.copy_image_failed',
  '目录深度超过限制': 'error.file.directory_not_exist',
  '压缩包总大小超过限制': 'error.file.total_size_exceeded',
  '同名文件/文件夹已存在': 'error.file.duplicate_name',
  '私人空间不支持删除操作': 'error.file.private_space_no_delete',
  '节点未被删除，无需恢复': 'error.file.node_not_deleted',
  '父节点已被删除，无法恢复': 'error.file.parent_deleted',
  '没有访问该资源库的权限': 'error.file.no_repo_access',
  '没有访问目标父节点的权限': 'error.file.no_target_parent_access',
  '回收站中不存在该项目': 'error.file.recycle_bin_not_found',
  '不能移动根节点': 'error.file.cannot_move_root',
  '目标父节点必须是文件夹或项目根目录': 'error.file.parent_must_be_folder_or_root',
  '不能将节点移动到自身': 'error.file.cannot_move_to_self',
  '不能拷贝根节点': 'error.file.cannot_copy_root',
  '不能将节点拷贝到自身': 'error.file.cannot_copy_to_self',
  '源节点不存在': 'error.file.source_not_found',
  '路径验证失败，无法安全删除': 'error.file.path_validation_failed',
  '未找到要操作的回收站项目': 'error.file.recycle_item_not_found',
  '没有权限操作项目 N 的回收站': 'error.file.no_recycle_permission',
  '未找到要恢复的项目': 'error.file.project_not_found_in_recycle',
  '未找到要删除的项目': 'error.file.delete_item_not_found',
  '搜索项目文件时必须提供 projectId': 'error.file.search_missing_project_id',
  '不支持的搜索范围': 'error.file.search_unsupported_scope',
  '不支持的下载格式': 'error.file.download_format_unsupported',
  'MXWEB 文件不存在，请确认文件已转换完成': 'error.file.mxweb_not_found',
  '转换后的文件不存在': 'error.file.converted_file_not_found',
  '外部参照文件不存在': 'error.file.external_ref_not_found',
  '源图纸节点不存在': 'error.file.source_drawing_not_found',
  '该节点是文件夹，不是文件': 'error.file.node_is_folder_not_file',
  '无效的外部参照文件': 'error.file.external_ref_invalid',
  '文件名包含非法字符': 'error.file.name_contains_illegal_chars',
  '文件大小超出限制（最大 100MB）': 'error.file.size_exceeded_limit',
  '存储配额不能为负数': 'error.file.quota_cannot_be_negative',
  '文件节点不存在或没有 path 字段': 'error.file.node_not_found_or_no_path',

  // ===== error.node =====
  '节点不存在': 'error.node.not_found',
  '节点不存在或没有父节点': 'error.node.not_found_or_no_parent',
  '不支持的排序字段': 'error.node.sort_unsupported',

  // ===== error.role =====
  '角色不存在': 'error.role.not_found',
  '系统角色不允许删除': 'error.role.system_cannot_delete',
  '角色正在使用中，无法删除': 'error.role.in_use_cannot_delete',
  '无法删除系统默认角色': 'error.role.system_default_cannot_delete',
  '无法修改系统默认角色的名称': 'error.role.system_default_cannot_modify_name',
  '项目角色不存在': 'error.role.project_not_found',
  '创建项目角色失败': 'error.role.create_failed',
  '项目角色名已存在': 'error.role.name_conflict',
  '更新项目角色失败': 'error.role.update_failed',
  '删除项目角色失败': 'error.role.delete_failed',
  '获取项目角色失败': 'error.role.fetch_failed',
  '获取项目角色详情失败': 'error.role.fetch_detail_failed',
  '获取项目角色列表失败': 'error.role.fetch_list_failed',
  '获取系统项目角色失败': 'error.role.fetch_system_failed',
  '获取角色权限失败': 'error.role.fetch_permissions_failed',
  '分配角色权限失败': 'error.role.assign_permissions_failed',
  '移除角色权限失败': 'error.role.remove_permissions_failed',
  '更新角色权限失败': 'error.role.update_permissions_failed',

  // ===== error.share =====
  '分享链接不存在': 'error.share.not_found',
  '分享链接已撤销': 'error.share.revoked',
  '分享链接已过期': 'error.share.expired',
  '分享的文件不存在': 'error.share.file_not_found',
  '文件已被删除': 'error.share.file_deleted',
  '只有创建者可以撤销分享': 'error.share.only_creator_can_revoke',
  '分享令牌与请求的文件不匹配': 'error.share.token_mismatch',
  '只有创建者可以修改分享设置': 'error.share.only_creator_can_modify',
  '没有资源库图纸的分享权限': 'error.share.no_permission_repo_drawing',
  '没有资源库图块的分享权限': 'error.share.no_permission_repo_block',
  '没有文件分享权限': 'error.share.no_permission_file',
  '只有文件所有者可以分享': 'error.share.only_owner_can_share',

  // ===== error.public_file =====
  '缺少源图纸哈希值': 'error.public_file.missing_source_hash',
  '缺少外部参照文件名': 'error.public_file.missing_ref_filename',
  '不支持的文件类型': 'error.public_file.type_unsupported',
  '无效的源路径': 'error.public_file.source_path_invalid',
  '文件不存在或已被删除': 'error.public_file.file_not_found_or_deleted',
  '未上传文件': 'error.public_file.no_file_uploaded',
  '仅支持 ... 文件': 'error.public_file.only_supported_types',
  '文件大小超出限制（最大 NMB）': 'error.public_file.size_exceeded',
  '缺少文件哈希值': 'error.public_file.missing_file_hash',
  '缺少 fileHash': 'error.public_file.missing_file_hash',
  '读取文件失败': 'error.public_file.read_failed',

  // ===== error.storage =====
  '无效的路径': 'error.storage.path_invalid',
  '不允许使用绝对路径': 'error.storage.absolute_path_not_allowed',
  '路径过长': 'error.storage.path_too_long',
  '路径超出允许的范围': 'error.storage.path_out_of_bounds',
  '路径是目录而非文件': 'error.storage.is_directory_not_file',

  // ===== error.mxcad =====
  '缺少必要参数: hash, name 或 size': 'error.mxcad.missing_params_hash_name_size',
  '缺少必要参数: chunks': 'error.mxcad.missing_params_chunks',
  '缺少必要参数: fileName': 'error.mxcad.missing_params_filename',
  '预加载数据不存在': 'error.mxcad.preload_data_not_found',
  '上下文参数不能为空': 'error.mxcad.context_params_empty',
  '保存到项目时必须提供projectId': 'error.mxcad.save_to_project_requires_project_id',
  '保存到资源库时必须提供libraryType': 'error.mxcad.save_to_library_requires_library_type',
  '目标文件夹不存在': 'error.mxcad.target_folder_not_found',
  '目标必须是文件夹': 'error.mxcad.target_must_be_folder',
  '您没有权限保存到此位置': 'error.mxcad.no_permission_save_to_location',
  '您没有资源库管理权限': 'error.mxcad.no_permission_library_management',
  '您没有权限保存到此项目': 'error.mxcad.no_permission_save_to_project',
  '缺少节点ID（nodeId），无法创建文件系统节点': 'error.mxcad.missing_node_id',
  '无法确定父节点ID': 'error.mxcad.cannot_determine_parent_id',

  // ===== error.mxcad.controller =====
  '刷新成功': 'error.mxcad.refresh_success',
  '未找到源图纸': 'error.mxcad.not_found_source',
  '无权限访问该图纸': 'error.mxcad.no_access_drawing',
  '权限验证失败': 'error.mxcad.permission_verification_failed',
  '图片文件拷贝失败': 'error.mxcad.copy_image_failed',
  '无效的文件路径': 'error.mxcad.path_invalid',
  '获取历史版本文件失败': 'error.mxcad.fetch_history_failed',
  '历史版本文件转换失败': 'error.mxcad.history_file_conversion_failed',

  // ===== error.font =====
  '获取字体列表失败': 'error.font.fetch_failed',
  '上传字体失败': 'error.font.upload_failed',
  '字体文件不存在': 'error.font.file_not_found',
  '删除字体失败': 'error.font.delete_failed',
  '下载字体失败': 'error.font.download_failed',
  '未提供文件': 'error.font.no_file',
  '禁止上传的可执行文件类型': 'error.font.executable_forbidden',
  '无法创建字体目录': 'error.font.cannot_create_directory',

  // ===== error.policy =====
  '未知的策略类型': 'error.policy.unknown_type',
  '策略配置验证失败': 'error.policy.config_validation_failed',
  '策略配置不存在': 'error.policy.config_not_found',
  '无效的时间格式': 'error.policy.invalid_time_format',
  '无效的时间值': 'error.policy.invalid_time_value',

  // ===== error.cache =====
  '不支持的缓存级别': 'error.cache.unsupported_level',
  '容量必须大于 0': 'error.cache.capacity_must_be_positive',

  // ===== error.audit =====
  '审计日志 ID 不存在': 'error.audit.log_not_found',

  // ===== error.billing =====
  '订单已被退款或状态已变更，请刷新后重试': 'error.billing.order_already_refunded',
  '退款请求发送失败，订单状态已恢复': 'error.billing.refund_failed_state_restored',

  // ===== error.library =====
  '公共资源库不存在，请先初始化': 'error.library.not_found',

  // ===== error.personal_space =====
  '个人空间不存在': 'error.personal_space.not_found',
  '请指定项目 ID 或用户 ID': 'error.personal_space.project_id_or_user_id_required',
  '路径解析结果不存在': 'error.personal_space.path_parse_not_found',

  // ===== error.version_control =====
  'MX 未初始化': 'error.version_control.mx_not_initialized',
  '没有文件需要提交': 'error.version_control.no_files_to_commit',
  '获取失败: 文件内容为空': 'error.version_control.fetch_failed_content_empty',

  // ===== success messages =====
  '操作成功': 'success.operation',
  '保存成功': 'success.saved',
  '删除成功': 'success.deleted',
  '刷新成功': 'success.refreshed',
  '提交成功': 'success.submitted',
  '获取成功': 'success.fetched',
  '角色已删除': 'success.role_deleted',
  '项目角色已删除': 'success.project_role_deleted',
  '分享已撤销': 'success.share_revoked',
  '成员移除成功': 'success.member_removed',
  '项目所有权转让成功': 'success.project_transferred',
  '缩略图上传成功': 'success.thumbnail_uploaded',
  '用户已恢复': 'success.user_restored',
  '用户删除成功': 'success.user_deleted',
  '账户注销成功': 'success.account_deactivated',
  '账户恢复成功': 'success.account_restored',
  '用户已注销，30天后自动清理数据': 'success.user_deactivated_30d_cleanup',
  '用户已立即注销并彻底删除数据': 'success.user_deactivated_immediate_cleanup',
  '微信解绑成功': 'success.wechat_unbound',
  '邮箱解绑成功': 'success.email_unbound',
  '手机号解绑成功': 'success.phone_unbound',
  '项目已从回收站恢复': 'success.project_restored',
  '项目回收站中没有任何项目': 'success.recycle_bin_empty',
  '项目已彻底删除': 'success.project_permanently_deleted',
  '已彻底删除': 'success.permanently_deleted',
  '请选择要恢复的项目': 'success.select_restore_item',
  '请选择要删除的项目': 'success.select_delete_item',
  '回收站中没有任何项目': 'success.recycle_bin_no_items',
  '另存成功': 'success.save_as_success',

  // ===== main.ts =====
  '登录已过期，请重新登录': 'error.auth.login_expired',
  '需要登录才能使用协同功能': 'error.auth.collaboration_login_required',
};

// ─── 工具函数 ─────────────────────────────────

function collectFiles(dir, ext) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...collectFiles(fullPath, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wrapWithI18n(chineseMsg, key) {
  // 使用 I18nContext.current()?.t('key') ?? '原中文'
  const escaped = chineseMsg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `I18nContext.current()?.t('${key}') ?? '${escaped}'`;
}

// ─── 主逻辑 ─────────────────────────────────

const files = collectFiles(BACKEND_SRC, '.ts');
console.log(`找到 ${files.length} 个 .ts 文件`);

let totalReplaced = 0;
let modifiedFiles = [];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  // 对每个映射条目进行替换
  for (const [chineseMsg, key] of Object.entries(MAPPING)) {
    // 只匹配异常构造函数中的中文消息和特定模式
    // 模式: throw new XxxException('中文消息')
    const escapedMsg = escapeRegex(chineseMsg);

    // 模式1: new XxxException('中文消息')
    const pattern1 = new RegExp(`(new\\s+\\w+Exception\\s*\\(\\s*)'(${escapedMsg})'`, 'g');
    if (pattern1.test(content)) {
      content = content.replace(pattern1, (match, prefix, _msg) => {
        return `${prefix}${wrapWithI18n(chineseMsg, key)}`;
      });
      changed = true;
    }

    // 模式2: res.status(XXX).json({ message: '中文消息' })
    const pattern2 = new RegExp(`(message\\s*:\\s*)'(${escapedMsg})'`, 'g');
    if (pattern2.test(content)) {
      content = content.replace(pattern2, (match, prefix, _msg) => {
        return `${prefix}(${wrapWithI18n(chineseMsg, key)})`;
      });
      changed = true;
    }

    // 模式3: { message: '中文消息' } (在 return 或对象中)
    const pattern3 = new RegExp(`(message\\s*[:=]\\s*)'(${escapedMsg})'`, 'g');
    if (pattern3.test(content)) {
      content = content.replace(pattern3, (match, prefix, _msg) => {
        return `${prefix}(${wrapWithI18n(chineseMsg, key)})`;
      });
      changed = true;
    }
  }

  if (changed) {
    // 添加 import { I18nContext } from 'nestjs-i18n' (如果还没有)
    if (!content.includes("from 'nestjs-i18n'") && !content.includes('from "nestjs-i18n"')) {
      // 找到最后一个 import 语句，在其后插入
      const importMatch = content.match(/^import.+?from\s+['"].+?['"];?\s*$/gm);
      if (importMatch && importMatch.length > 0) {
        const lastImport = importMatch[importMatch.length - 1];
        const lastImportIndex = content.lastIndexOf(lastImport) + lastImport.length;
        content =
          content.slice(0, lastImportIndex) +
          "\nimport { I18nContext } from 'nestjs-i18n';" +
          content.slice(lastImportIndex);
      } else {
        // 没有 import 语句，在文件开头添加
        content = "import { I18nContext } from 'nestjs-i18n';\n" + content;
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    modifiedFiles.push(filePath);
    totalReplaced++;
  }
}

console.log(`\n修改了 ${modifiedFiles.length} 个文件`);
for (const f of modifiedFiles) {
  console.log(`  ${path.relative(BACKEND_SRC, f)}`);
}
console.log('\n完成！建议运行 pnpm type-check 验证。');
