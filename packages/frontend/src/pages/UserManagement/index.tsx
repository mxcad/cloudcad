import {
  AlertCircle,
  UserPlus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Users,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import { Button, Tab, Tabs, Tag } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFileBrowserSelection } from '@/hooks/file-browser';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { globalShowToast } from '@/utils/notificationEvents';
import type { CreateUserDto, UserResponseDto, UpdateUserDto } from '@/api-sdk';
import { vipControllerGetActiveTiers } from '@/api-sdk';
import { FREE_TIER_LEVEL } from '@/constants/vip';
import type { SelectOption } from '@/components/ui/Select';
import { useUserCRUD } from './hooks/useUserCRUD';
import { useUserSearch } from './hooks/useUserSearch';
import { UserTable, type UserTableUser } from './UserTable';
import { UserSearchBar } from './UserSearchBar';
import { CreateUserModal } from './UserModals/CreateUserModal';
import { EditUserModal } from './UserModals/EditUserModal';
import { MembershipManageModal } from './UserModals/MembershipManageModal';
import { DeleteUserConfirm } from './UserModals/DeleteUserConfirm';
import styles from './UserManagement.module.css';

// 运营统计嵌入本页 Tab（独立路由 /admin/stats 仍保留深链可用）
const AdminStatsPage = lazy(() => import('../AdminStatsPage'));

export const UserManagement = () => {
  useDocumentTitle(t('用户管理'));
  const { hasPermission } = usePermission();
  const [canAccess, setCanAccess] = useState(false);

  const {
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    tierFilter,
    setTierFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    userTab,
    setUserTab,
  } = useUserSearch();

  // VIP 等级列表（动态获取上架等级，用于筛选下拉框）
  const [tierOptions, setTierOptions] = useState<SelectOption[]>([
    { value: '', label: t('所有会员') },
  ]);
  useEffect(() => {
    let cancelled = false;
    vipControllerGetActiveTiers()
      .then((result) => {
        if (cancelled || result.error) return;
        const tiers = (result.data ?? []) as { level: number; name: string }[];
        const options: SelectOption[] = [
          { value: '', label: t('所有会员') },
          ...tiers
            .filter((tier) => typeof tier.level === 'number')
            .map((tier) => ({
              value: String(tier.level),
              label:
                tier.level === FREE_TIER_LEVEL
                  ? t('免费用户')
                  : t('VIP{level}', { level: String(tier.level) }),
            })),
          { value: 'expired', label: t('已过期') },
        ];
        setTierOptions(options);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const apiParams = useMemo(
    () => ({
      search: searchQuery || undefined,
      roleId: roleFilter || undefined,
      tierLevel: tierFilter || undefined,
      status: userTab === 'deleted' ? 'DELETED' : undefined,
      sortBy,
      sortOrder,
      page: currentPage,
      limit: pageSize,
    }),
    [
      searchQuery,
      roleFilter,
      tierFilter,
      userTab,
      sortBy,
      sortOrder,
      currentPage,
      pageSize,
    ]
  );

  const {
    users,
    totalUsers,
    loading,
    error,
    roles,
    mailEnabled,
    smsEnabled,
    createUser,
    updateUser,
    deleteUser,
    restoreUser,
    updateUserMembership,
    loadUsers,
    triggerCleanup,
  } = useUserCRUD(apiParams);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponseDto | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
    nickname: '',
    avatar: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  });
  const [formErrors, setFormErrors] = useState({
    username: '',
    email: '',
    password: '',
    phone: '',
    nickname: '',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // 创建/编辑弹窗内展示的提交错误（重名等后端消息），与列表加载错误 error 分离
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleteImmediately, setDeleteImmediately] = useState(false);

  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [membershipUser, setMembershipUser] = useState<UserTableUser | null>(
    null
  );
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // ── 滚动分页数据合并（tab/搜索/角色/排序变化时整体替换；滚动翻页不清空选择）──
  // resetKey 含排序：排序变化属于查询身份变化，防挂起的 next/prev 方向跨查询误合并
  const {
    viewNodes: viewUsers,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: users,
    currentPage,
    handlePageChange: setCurrentPage,
    resetKey: `${userTab}|${searchQuery}|${roleFilter}|${sortBy}|${sortOrder}|${pageSize}`,
  });

  // ── 多选（ADR-0052 统一机制：选择内核 + 快捷键 + 滚动分页合并）──
  // 内核 nodes 与渲染 rows（viewUsers 累积列表）保持一致：
  // 跨页滚动后表头全选/Ctrl+A 作用于全部已加载页，勾选状态与行为不脱节
  const selectableUsers = useMemo(
    () => viewUsers.map((u) => ({ id: u.id })),
    [viewUsers]
  );
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({ nodes: selectableUsers, multiple: 'always' });
  const selectedCount = selectedNodes.size;

  // 每页条数变化：重置到第一页并清空选择（分页合并 resetKey 已含 pageSize 整体替换）
  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      if (newSize === pageSize) return;
      clearSelection();
      setCurrentPage(1);
      setPageSize(newSize);
    },
    [pageSize, clearSelection, setCurrentPage, setPageSize]
  );

  // 批量操作状态
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchRestoring, setBatchRestoring] = useState(false);

  // 查询身份（tab/搜索/角色/排序）变化时清空选择（历史选择不再指向当前列表）
  useEffect(() => {
    clearSelection();
  }, [
    userTab,
    searchQuery,
    roleFilter,
    tierFilter,
    sortBy,
    sortOrder,
    clearSelection,
  ]);

  // 批量注销（仅软删，进入冷静期；确认弹窗由 DeleteUserConfirm count 模式承担）
  const openBatchDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedNodes.size === 0) return;
    setBatchDeleting(true);
    const ids = Array.from(selectedNodes);
    let successCount = 0;
    let failCount = 0;
    let firstError = '';
    for (const id of ids) {
      try {
        await deleteUser(id, false);
        successCount++;
      } catch (err) {
        failCount++;
        firstError ||= getErrorMessage(err);
      }
    }
    if (successCount > 0) {
      showSuccess(
        successCount > 1
          ? t('已注销 {count} 个用户', { count: String(successCount) })
          : t('用户删除成功')
      );
    }
    if (failCount > 0) {
      globalShowToast(
        firstError
          ? `${t('{count} 个用户注销失败', { count: String(failCount) })}：${firstError}`
          : t('{count} 个用户注销失败', { count: String(failCount) }),
        'error'
      );
    }
    setBatchDeleting(false);
    setDeleteConfirmOpen(false);
    clearSelection();
    await loadUsers();
  };

  // 批量恢复（非破坏性，与单条恢复一致直接执行 + 汇总提示）
  const handleBatchRestore = async () => {
    if (selectedNodes.size === 0) return;
    setBatchRestoring(true);
    const ids = Array.from(selectedNodes);
    let successCount = 0;
    let failCount = 0;
    let firstError = '';
    for (const id of ids) {
      try {
        await restoreUser(id);
        successCount++;
      } catch (err) {
        failCount++;
        firstError ||= getErrorMessage(err);
      }
    }
    if (successCount > 0) {
      showSuccess(
        successCount > 1
          ? t('已恢复 {count} 个用户', { count: String(successCount) })
          : t('用户已恢复')
      );
    }
    if (failCount > 0) {
      globalShowToast(
        firstError
          ? `${t('{count} 个用户恢复失败', { count: String(failCount) })}：${firstError}`
          : t('{count} 个用户恢复失败', { count: String(failCount) }),
        'error'
      );
    }
    setBatchRestoring(false);
    clearSelection();
    await loadUsers();
  };

  // 多选快捷键：ESC 清空 / Ctrl+A 全选 / Delete 批量注销（仅活跃 tab + 删除权限）
  const canDeletePermission = hasPermission(
    SystemPermission.SYSTEM_USER_DELETE
  );
  useSelectionShortcuts({
    enabled: !loading,
    onClearSelection: clearSelection,
    onSelectAll: handleSelectAll,
    onDeleteSelected:
      userTab === 'active' && canDeletePermission ? openBatchDelete : undefined,
    canDelete: selectedCount > 0,
  });

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) {
      await loadUsers();
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    try {
      const hasAccessVal =
        hasPermission(SystemPermission.SYSTEM_USER_READ) ||
        hasPermission(SystemPermission.SYSTEM_USER_CREATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_UPDATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_DELETE);
      setCanAccess(hasAccessVal);
      return hasAccessVal;
    } catch (error) {
      setCanAccess(false);
      return false;
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    const defaultRole = roles.find((r) => r.name === 'USER');
    setFormData({
      username: '',
      email: '',
      phone: '',
      password: '',
      roleId: defaultRole?.id || '',
      nickname: '',
      avatar: '',
      status: 'ACTIVE',
    });
    setFormErrors({
      username: '',
      email: '',
      password: '',
      phone: '',
      nickname: '',
    });
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserTableUser) => {
    setEditingUser(user as UserResponseDto);
    setFormData({
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      roleId: user.role?.id || '',
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      status: (user.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') || 'ACTIVE',
    });
    setFormErrors({
      username: '',
      email: '',
      password: '',
      phone: '',
      nickname: '',
    });
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors = {
      username: '',
      email: '',
      password: '',
      phone: '',
      nickname: '',
    };
    if (!formData.username) {
      errors.username = t('用户名不能为空');
    } else if (formData.username.length < 3) {
      errors.username = t('用户名至少3个字符');
    } else if (formData.username.length > 20) {
      errors.username = t('用户名最多20个字符');
    }
    if (mailEnabled && !formData.email) {
      errors.email = t('邮箱不能为空');
    } else if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      errors.email = t('邮箱格式不正确');
    }
    if (!editingUser && !formData.password) {
      errors.password = t('密码不能为空');
    }
    if (formData.phone && !/^1[3-9]\d{9}$/.test(formData.phone)) {
      errors.phone = t('请输入正确的手机号');
    }
    if (formData.nickname && formData.nickname.length > 50) {
      errors.nickname = t('昵称最多50个字符');
    }
    setFormErrors(errors);
    return (
      !errors.username &&
      !errors.email &&
      !errors.password &&
      !errors.phone &&
      !errors.nickname
    );
  };

  const handleSubmit = async (_data: {
    username: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    nickname: string;
    status?: string;
  }) => {
    if (!validateForm()) return;
    try {
      if (editingUser) {
        const updateData: Record<string, unknown> = {
          username: formData.username,
          roleId: formData.roleId,
          status: formData.status,
        };
        // 可选字段：仅当有值时传递
        if (formData.email) updateData.email = formData.email;
        if (formData.nickname) updateData.nickname = formData.nickname;
        if (formData.phone) updateData.phone = formData.phone;
        if (formData.avatar) updateData.avatar = formData.avatar;
        if (formData.password) updateData.password = formData.password;
        await updateUser(editingUser.id, updateData as UpdateUserDto);
        showSuccess(t('用户更新成功'));
      } else {
        const createData: Record<string, unknown> = {
          username: formData.username,
          password: formData.password,
          roleId: formData.roleId,
        };
        // 可选字段：仅当有值时传递
        if (formData.email) createData.email = formData.email;
        if (formData.nickname) createData.nickname = formData.nickname;
        if (formData.phone) createData.phone = formData.phone;
        await createUser(createData as CreateUserDto);
        showSuccess(t('用户创建成功'));
      }
      setIsModalOpen(false);
      await loadUsers();
    } catch (err) {
      // 创建/编辑失败：错误在弹窗内展示（重名等后端消息经 getErrorMessage 提取），
      // 不再混入列表加载错误 —— 否则列表非空时错误渲染到表格底部失败条、弹窗内无任何提示
      setSubmitError(
        getErrorMessage(err) ||
          (editingUser ? t('更新用户失败') : t('创建用户失败'))
      );
    }
  };

  const handleDelete = (id: string) => {
    setUserToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete, deleteImmediately);
      showSuccess(
        deleteImmediately ? t('用户立即注销成功') : t('用户删除成功')
      );
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      setDeleteImmediately(false);
      await loadUsers();
    } catch (err) {
      // 删除失败：toast 提示，弹窗保持打开以便用户重试或取消
      globalShowToast(getErrorMessage(err) || t('删除用户失败'), 'error');
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setUserToDelete(null);
    setDeleteImmediately(false);
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreUser(id);
      showSuccess(t('用户已恢复'));
      await loadUsers();
    } catch (err) {
      globalShowToast(getErrorMessage(err) || t('恢复用户失败'), 'error');
    }
  };

  const handleOpenMembership = (user: UserTableUser) => {
    setMembershipError(null);
    setMembershipUser(user);
    setMembershipModalOpen(true);
  };

  const handleMembershipSubmit = async (data: {
    tierLevel: number;
    expiresAt?: string;
    adjustDays?: number;
  }) => {
    if (!membershipUser) return;
    setMembershipError(null);
    try {
      await updateUserMembership(membershipUser.id, data);
      showSuccess(t('用户会员更新成功'));
      setMembershipModalOpen(false);
      setMembershipUser(null);
      await loadUsers();
    } catch (err) {
      // SDK error 是普通对象（非 Error 实例），instanceof 判断恒不命中，
      // 必须用 getErrorMessage 提取后端消息
      setMembershipError(getErrorMessage(err) || t('更新会员失败'));
    }
  };

  if (!canAccess) {
    return (
      <div className={styles.userManagementContainer}>
        <div className={styles.accessDeniedState}>
          <div className={styles.accessDeniedIcon}>
            <AlertCircle size={48} />
          </div>
          <h2 className={styles.accessDeniedTitle}>{t('访问被拒绝')}</h2>
          <p className={styles.accessDeniedText}>
            {t('您没有权限访问此页面。')}
          </p>
        </div>
      </div>
    );
  }

  if (!hasPermission(SystemPermission.SYSTEM_USER_READ)) {
    return (
      <div className={styles.userManagementContainer}>
        <div className={styles.limitedAccessCard}>
          <div className={styles.limitedAccessIcon}>
            <AlertCircle size={48} />
          </div>
          <h2 className={styles.limitedAccessTitle}>{t('无法查看用户列表')}</h2>
          <div className={styles.permissionBadges}>
            {hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
              <Tag variant="success">{t('创建用户')}</Tag>
            )}
            {hasPermission(SystemPermission.SYSTEM_USER_UPDATE) && (
              <Tag variant="primary">{t('更新用户')}</Tag>
            )}
            {hasPermission(SystemPermission.SYSTEM_USER_DELETE) && (
              <Tag variant="error">{t('删除用户')}</Tag>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userManagementContainer}>
      {successMessage && (
        <div className={styles.successToast}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 首屏/查询无内容时的错误 banner（列表已有内容时由底部失败条提示，见 UserTable loadError） */}
      {userTab !== 'stats' && error && viewUsers.length === 0 && (
        <div className={styles.errorBanner}>
          <XCircle size={18} />
          <span>{error}</span>
          <Button
            onClick={loadUsers}
            loading={loading}
            variant="secondary"
            icon={RefreshCw}
            className={styles.errorRetryBtn}
          >
            {t('重试')}
          </Button>
        </div>
      )}

      <div className={styles.pageHeader}>
        <div className={styles.pageTitleSection}>
          <div className={styles.pageTitleIcon}>
            <Users size={24} />
          </div>
          <div>
            <h1 className={styles.pageTitle}>{t('用户管理')}</h1>
            <p className={styles.pageSubtitle}>
              {t('管理团队成员、分配角色及存储配额')}
            </p>
          </div>
        </div>
        {hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
          <Button
            onClick={handleOpenCreate}
            disabled={loading}
            className={styles.addUserBtn}
          >
            <UserPlus size={18} />
            {t('添加用户')}
          </Button>
        )}
        {hasPermission(SystemPermission.SYSTEM_USER_DELETE) && (
          <Button
            onClick={() => setCleanupModalOpen(true)}
            disabled={loading}
            variant="outline"
            className={styles.cleanupBtn}
          >
            <Sparkles size={18} />
            {t('清理已注销用户')}
          </Button>
        )}
      </div>

      {hasPermission(SystemPermission.SYSTEM_USER_READ) && (
        <Tabs>
          <Tab
            active={userTab === 'active'}
            onClick={() => {
              setUserTab('active');
              setCurrentPage(1);
            }}
          >
            {t('活跃用户')}
          </Tab>
          <Tab
            active={userTab === 'deleted'}
            onClick={() => {
              setUserTab('deleted');
              setCurrentPage(1);
            }}
          >
            {t('已注销')}
          </Tab>
          <Tab active={userTab === 'stats'} onClick={() => setUserTab('stats')}>
            {t('运营统计')}
          </Tab>
        </Tabs>
      )}

      {userTab === 'stats' ? (
        <div className={styles.statsPanel}>
          <Suspense fallback={null}>
            <AdminStatsPage embedded />
          </Suspense>
        </div>
      ) : (
        <>
          <UserSearchBar
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setCurrentPage(1);
            }}
            roleFilter={roleFilter}
            onRoleFilterChange={(r) => {
              setRoleFilter(r);
              setCurrentPage(1);
            }}
            roles={roles}
            tierFilter={tierFilter}
            onTierFilterChange={(tier) => {
              setTierFilter(tier);
              setCurrentPage(1);
            }}
            tierOptions={tierOptions}
            sortBy={sortBy}
            onSortByChange={(field) => {
              setSortBy(field);
              setCurrentPage(1); // 排序变化重置页码：新排序下深层页码无意义
            }}
            sortOrder={sortOrder}
            onSortOrderChange={(order) => {
              setSortOrder(order);
              setCurrentPage(1);
            }}
          />

          <div className={styles.usersTableCard}>
            {/* 表格撑满剩余空间（页面恒一屏，列表内部滚动） */}
            <div className="flex-1 min-h-0 flex flex-col">
              <UserTable
                users={viewUsers}
                mailEnabled={mailEnabled}
                smsEnabled={smsEnabled}
                canEdit={hasPermission(SystemPermission.SYSTEM_USER_UPDATE)}
                canDelete={canDeletePermission}
                canManageMembership={hasPermission(
                  SystemPermission.SYSTEM_USER_MEMBERSHIP_MANAGE
                )}
                selectedIds={selectedNodes}
                onToggleSelect={handleNodeSelect}
                onToggleSelectAll={handleSelectAll}
                onRubberBandSelect={selectMany}
                paginationMeta={{
                  total: totalUsers,
                  page: currentPage,
                  limit: pageSize,
                  // 不 || 1：totalPages 未同步（total=0）时为 0，防首屏误报「已经是最后一页」
                  totalPages: Math.ceil(totalUsers / pageSize),
                }}
                onPageChange={(next) => {
                  clearSelection();
                  setCurrentPage(next);
                }}
                showSizeChanger
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={[30, 50, 100]}
                onScrollPageChange={handleScrollPageChange}
                minLoadedPage={minLoadedPage}
                loadError={error && viewUsers.length > 0 ? error : null}
                onRetryLoadMore={loadUsers}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onManageMembership={handleOpenMembership}
                userTab={userTab}
                loading={loading}
                // 底部悬浮操作栏：列表滚动容器内 sticky 吸底（列表撑满一屏，不遮分页栏）
                bottomBar={
                  selectedCount > 0 ? (
                    <BatchActionBar
                      count={selectedCount}
                      onClear={clearSelection}
                      actions={
                        userTab === 'deleted'
                          ? [
                              {
                                key: 'restore',
                                label: t('批量恢复'),
                                loading: batchRestoring,
                                onClick: () => void handleBatchRestore(),
                              },
                            ]
                          : canDeletePermission
                            ? [
                                {
                                  key: 'delete',
                                  label: t('批量注销'),
                                  variant: 'danger',
                                  loading: batchDeleting,
                                  onClick: openBatchDelete,
                                },
                              ]
                            : []
                      }
                    />
                  ) : undefined
                }
              />
            </div>
          </div>
        </>
      )}

      {editingUser ? (
        <EditUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          onAvatarUploaded={() => loadUsers()}
          roles={roles}
          mailEnabled={mailEnabled}
          loading={loading}
          user={editingUser}
          formData={formData}
          formErrors={formErrors}
          onFormChange={handleFormChange}
          submitError={submitError}
        />
      ) : (
        <CreateUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          roles={roles}
          mailEnabled={mailEnabled}
          loading={loading}
          formData={formData}
          formErrors={formErrors}
          onFormChange={handleFormChange}
          submitError={submitError}
        />
      )}

      <MembershipManageModal
        isOpen={membershipModalOpen}
        onClose={() => {
          setMembershipError(null);
          setMembershipModalOpen(false);
          setMembershipUser(null);
        }}
        onSubmit={handleMembershipSubmit}
        loading={loading}
        error={membershipError}
        currentMembership={
          membershipUser
            ? {
                tierLevel: membershipUser.membershipTierLevel,
                expiresAt: membershipUser.membershipExpiresAt,
              }
            : undefined
        }
        userName={membershipUser?.nickname || membershipUser?.username || ''}
      />

      <DeleteUserConfirm
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        onConfirm={
          userToDelete ? confirmDelete : () => void confirmBatchDelete()
        }
        loading={loading}
        count={userToDelete ? undefined : selectedCount}
        deleteImmediately={deleteImmediately}
        onDeleteImmediatelyChange={setDeleteImmediately}
      />

      <Modal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        title={t('确认清理')}
        className="max-w-sm"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={() => setCleanupModalOpen(false)}
              disabled={cleanupLoading}
            >
              {t('取消')}
            </Button>
            <Button
              onClick={async () => {
                setCleanupLoading(true);
                try {
                  const result = await triggerCleanup(0);
                  showSuccess(result?.message || t('清理完成'));
                  setCleanupModalOpen(false);
                  await loadUsers();
                } catch (err) {
                  globalShowToast(
                    getErrorMessage(err) || t('操作失败，请重试'),
                    'error'
                  );
                } finally {
                  setCleanupLoading(false);
                }
              }}
              disabled={cleanupLoading}
              variant="danger"
              className={styles.submitBtn}
            >
              {cleanupLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('清理中...')}
                </>
              ) : (
                t('确认清理')
              )}
            </Button>
          </div>
        }
      >
        <p className={styles.cleanupConfirmText}>
          {t('确定要清理所有已注销的用户吗？此操作不可恢复。')}
        </p>
      </Modal>
    </div>
  );
};

export default UserManagement;
