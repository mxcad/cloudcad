import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RefreshCw, X, UserPlus, AlertCircle, Loader2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TruncateText } from '@/components/ui/TruncateText';
import { projectMemberApi } from '@/services/projectMemberApi'; // @deprecated for transferOwnership only
import { fileSystemControllerGetProjectMembers, fileSystemControllerAddProjectMember, fileSystemControllerRemoveProjectMember, fileSystemControllerUpdateProjectMember } from '@/api-sdk';
import { usersControllerSearchUsers } from '@/api-sdk';
import { rolesControllerGetProjectRolesByProject } from '@/api-sdk';
import { useProjectPermission } from '@/hooks/useProjectPermission';
import {
  ProjectPermission,
  getRoleDisplayName,
} from '@/constants/permissions';
import type { ProjectMemberDto, UserResponseDto } from '@/types/api-client';

interface Member extends ProjectMemberDto {
  // 添加 userId 作为 id 的别名以保持兼容性
  userId: string;
}

interface UserSearchResult extends UserResponseDto {
  // 使用 API 返回的用户类型
}

interface MembersModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  isOpen,
  projectId,
  onClose,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [projectRoles, setProjectRoles] = useState<
    { id: string; name: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [adding, setAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterRoleId, setFilterRoleId] = useState<string>('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(
    null
  );
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canAssignRoles, setCanAssignRoles] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitializedRef = useRef(false);
  const { checkPermission } = useProjectPermission();

  const loadMembers = useCallback(async () => {
    setErrorMessage('');
    try {
      const data = await fileSystemControllerGetProjectMembers({ path: { projectId } }) as any;
      // 映射 id 为 userId 以保持兼容性
      const membersWithUserId = (
        (data || []) as ProjectMemberDto[]
      ).map((m) => ({ ...m, userId: m.id }));
      setMembers(membersWithUserId as Member[]);
    } catch (error) {
      setErrorMessage('加载成员列表失败');
    }
  }, [projectId]);

  const loadProjectRoles = useCallback(async () => {
    try {
      const response = await rolesControllerGetProjectRolesByProject({ path: { projectId } }) as any;
      const allRoles = (response as { id: string; name: string }[]) || [];

      // 添加成员时可用的角色（排除 PROJECT_OWNER）
      const addMemberRoles = allRoles.filter(
        (role) => role.name !== 'PROJECT_OWNER'
      );

      setProjectRoles(allRoles);

      // 设置默认角色为 PROJECT_MEMBER
      const defaultRole = addMemberRoles.find(
        (r) => r.name === 'PROJECT_MEMBER'
      );
      if (defaultRole) {
        setNewRoleId((prev) => prev || defaultRole.id);
      }
    } catch (error) {
      setErrorMessage('加载项目角色失败');
    }
  }, [projectId]);

  // 根据角色筛选成员
  const filteredMembers = filterRoleId
    ? members.filter((member) => member.projectRoleId === filterRoleId)
    : members;

  // 搜索用户
  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await usersControllerSearchUsers({ query: { search: query, limit: 10 } }) as any;
        // response.data 是 UserListResponseDto，包含 users 数组
        const users = (response?.users || []) as UserSearchResult[];

        // 过滤掉已经是成员的用户
        const memberUserIds = members.map((m) => m.id);
        const availableUsers = users.filter(
          (u) => !memberUserIds.includes(u.id)
        );

        setSearchResults(availableUsers);
      } catch (error) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [members]
  );

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showAddForm && !selectedUser) {
        searchUsers(newEmail);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newEmail, showAddForm, selectedUser, searchUsers]);

  useEffect(() => {
    if (isOpen && !isInitializedRef.current) {
      isInitializedRef.current = true;

      // 重置状态
      setNewEmail('');
      setNewRoleId('');
      setShowAddForm(false);
      setErrorMessage('');
      setSearchResults([]);
      setSelectedUser(null);
      setCanManageMembers(false);
      setCanAssignRoles(false);

      // 开始加载
      setLoading(true);
      setLoadingPermissions(true);

      // 并行加载数据和权限
      Promise.all([
        loadMembers(),
        loadProjectRoles(),
        checkPermission(projectId, ProjectPermission.PROJECT_MEMBER_MANAGE),
        checkPermission(projectId, ProjectPermission.PROJECT_MEMBER_ASSIGN),
      ])
        .then((results) => {
          setCanManageMembers(results[2]);
          setCanAssignRoles(results[3]);
        })
        .catch((error) => {
          setErrorMessage('加载数据失败');
        })
        .finally(() => {
          setLoading(false);
          setLoadingPermissions(false);
        });
    }
    if (!isOpen) {
      isInitializedRef.current = false;
    }
  }, [isOpen, projectId, checkPermission]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newRoleId) return;

    setAdding(true);
    setErrorMessage('');
    try {
      // 添加成员
      const memberData = await fileSystemControllerAddProjectMember({ path: { projectId }, body: {
        userId: selectedUser.id,
        projectRoleId: newRoleId,
      } } as any) as any;

      const newMember: Member = {
        id: memberData.id,
        userId: memberData.id,
        email: memberData.email,
        username: memberData.username,
        nickname: memberData.nickname,
        avatar: memberData.avatar,
        projectRoleId: memberData.projectRoleId,
        projectRoleName: memberData.projectRoleName,
        joinedAt: memberData.joinedAt
      };
      setMembers((prev) => [...prev, newMember]);

      // 重置表单
      setNewEmail('');
      setNewRoleId('');
      setShowAddForm(false);
      setSearchResults([]);
      setSelectedUser(null);
    } catch (error) {
      if (
        (error as Error & { response?: { status?: number } }).response
          ?.status === 403
      ) {
        setErrorMessage('没有权限添加成员');
      } else {
        setErrorMessage('添加成员失败，请重试');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setErrorMessage('');
    try {
      await fileSystemControllerRemoveProjectMember({ path: { projectId, userId } } as any);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (error) {
      if (
        (error as Error & { response?: { status?: number } }).response
          ?.status === 403
      ) {
        setErrorMessage('没有权限移除成员');
      } else {
        setErrorMessage('移除成员失败，请重试');
      }
    }
  };

  const handleUpdateRole = async (userId: string, projectRoleId: string) => {
    setErrorMessage('');
    try {
      await fileSystemControllerUpdateProjectMember({ path: { projectId, userId }, body: {
        projectRoleId,
      } } as any);
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, projectRoleId } : m))
      );
    } catch (error) {
      if (
        (error as Error & { response?: { status?: number } }).response
          ?.status === 403
      ) {
        setErrorMessage('没有权限更新成员角色');
      } else if (
        (error as Error & { response?: { status?: number } }).response
          ?.status === 400
      ) {
        setErrorMessage('不能修改项目所有者的角色');
      } else {
        setErrorMessage('更新角色失败，请重试');
      }
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget) return;

    setTransferring(true);
    setErrorMessage('');
    try {
      await projectMemberApi.transferOwnership(projectId, transferTarget.userId);

      // 刷新成员列表
      await loadMembers();

      setShowTransferModal(false);
      setTransferTarget(null);
    } catch (error) {
      if (
        (error as Error & { response?: { status?: number } }).response
          ?.status === 403
      ) {
        setErrorMessage('没有权限转让项目');
      } else {
        setErrorMessage('转让项目失败，请重试');
      }
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="项目成员"
        footer={
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        }
      >
        <div className="space-y-4" ref={contentRef}>
          {/* 错误提示 */}
          {errorMessage && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{
                background: 'var(--error-light)',
                color: 'var(--error)',
              }}
            >
              <AlertCircle size={16} />
              {errorMessage}
            </div>
          )}

          {/* 添加成员按钮/表单 */}
          {!showAddForm ? (
            canManageMembers ? (
              <button
                data-tour="invite-member-btn"
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 px-4 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 transition-colors"
                style={{
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-400)';
                  e.currentTarget.style.color = 'var(--primary-600)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
              >
                <UserPlus size={18} />
                添加成员
              </button>
            ) : loadingPermissions ? (
              <div
                className="w-full py-2 px-4 border-2 border-dashed rounded-lg flex items-center justify-center gap-2"
                style={{
                  borderColor: 'var(--border-default)',
                }}
              >
                <Loader2
                  size={18}
                  className="animate-spin"
                  style={{ color: 'var(--text-muted)' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>
                  检查权限中...
                </span>
              </div>
            ) : null
          ) : (
            <form
              onSubmit={handleAddMember}
              className="p-4 rounded-lg relative"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <UserPlus
                  size={18}
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  添加新成员
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewEmail('');
                    setErrorMessage('');
                    setSearchResults([]);
                    setSelectedUser(null);
                  }}
                  className="ml-auto p-1 rounded"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                {/* 用户搜索输入框 */}
                <div className="relative">
                  <input
                    data-tour="member-search-input"
                    ref={searchInputRef}
                    type="text"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setSelectedUser(null);
                    }}
                    placeholder="搜索用户（邮箱或用户名）"
                    className="w-full px-3 py-2 rounded-lg text-sm input-theme"
                    autoComplete="off"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2
                        size={16}
                        className="animate-spin"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </div>
                  )}
                </div>

                {/* 搜索结果下拉列表 */}
                {searchResults.length > 0 && !selectedUser && (
                  <div
                    className="absolute z-10 w-full rounded-lg shadow-lg max-h-60 overflow-y-auto"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewEmail(user.email);
                          setSearchResults([]);
                        }}
                        className="w-full px-3 py-2 text-left last:border-b-0 dropdown-item-theme"
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                            style={{
                              background: 'var(--primary-100)',
                              color: 'var(--primary-600)',
                            }}
                          >
                            {(user?.nickname ||
                              user?.username ||
                              user?.email)?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-medium"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <TruncateText>
                                {user.nickname || user.username}
                              </TruncateText>
                            </p>
                            <p
                              className="text-xs"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              <TruncateText>{user.email}</TruncateText>
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* 已选用户显示 */}
                {selectedUser && (
                  <div
                    className="flex items-center gap-2 p-2 rounded-lg flex-shrink-0"
                    style={{
                      background: 'var(--primary-50)',
                      border: '1px solid var(--primary-200)',
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                      style={{
                        background: 'var(--primary-100)',
                        color: 'var(--primary-600)',
                      }}
                    >
                      {(
                        (selectedUser.nickname ||
                          selectedUser.username ||
                          selectedUser.email ||
                          '?')[0] ?? '?'
                      ).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <TruncateText>
                          {selectedUser.nickname || selectedUser.username}
                        </TruncateText>
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <TruncateText>{selectedUser.email}</TruncateText>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setNewEmail('');
                      }}
                      className="p-1 rounded flex-shrink-0"
                      style={{
                        color: 'var(--text-tertiary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--primary-200)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* 角色选择和添加按钮 */}
                <div className="flex gap-2">
                  <select
                    data-tour="member-role-select"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm input-theme"
                    disabled={loading}
                    style={{ maxWidth: '200px' }}
                  >
                    <option value="">请选择角色</option>
                    {projectRoles
                      .filter((role) => role.name !== 'PROJECT_OWNER')
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {getRoleDisplayName(role.name, false)}
                        </option>
                      ))}
                  </select>
                  <Button
                    data-tour="member-add-btn"
                    type="submit"
                    size="sm"
                    disabled={adding || !selectedUser || !newRoleId}
                  >
                    {adding ? '添加中...' : '添加'}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* 筛选条 */}
          {members.length > 0 && (
            <div className="flex items-center justify-between">
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                共 {filteredMembers.length} 人
              </span>
              <select
                value={filterRoleId}
                onChange={(e) => setFilterRoleId(e.target.value)}
                className="px-3 py-1.5 rounded text-sm input-theme"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
              >
                <option value="">所有角色</option>
                {projectRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {getRoleDisplayName(role.name, false)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 成员列表 */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw
                  size={20}
                  className="animate-spin"
                  style={{ color: 'var(--text-muted)' }}
                />
                <span
                  className="ml-2"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  加载中...
                </span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div
                className="text-center py-8"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {filterRoleId ? '没有符合条件的成员' : '暂无成员'}
              </div>
            ) : (
              filteredMembers.map((member) => {
                const isOwner =
                  member.projectRoleName === 'PROJECT_OWNER';

                const displayName =
                  member.nickname ||
                  member.username ||
                  member.email ||
                  '未知用户';

                const avatarLetter =
                  displayName[0]?.toUpperCase() || '?';

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--bg-tertiary)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                      style={{
                        background: 'var(--primary-100)',
                        color: 'var(--primary-600)',
                      }}
                    >
                      {avatarLetter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <TruncateText>{displayName}</TruncateText>
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <TruncateText>
                          {member.email || '无邮箱'}
                        </TruncateText>
                      </p>
                    </div>
                    {isOwner ? (
                      <span
                        className="px-2 py-1 text-xs rounded flex-shrink-0 font-medium"
                        style={{
                          background: 'var(--primary-100)',
                          color: 'var(--primary-700)',
                        }}
                      >
                        项目所有者
                      </span>
                    ) : (
                      <select
                        value={member.projectRoleId}
                        onChange={(e) =>
                          handleUpdateRole(member.id, e.target.value)
                        }
                        disabled={!canAssignRoles}
                        className={`px-2 py-1 text-xs rounded flex-shrink-0 input-theme ${
                          !canAssignRoles
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        }`}
                        style={{ maxWidth: '100px' }}
                      >
                        {projectRoles
                          .filter(
                            (role) => role.name !== 'PROJECT_OWNER'
                          )
                          .map((role) => (
                            <option key={role.id} value={role.id}>
                              {getRoleDisplayName(role.name, false)}
                            </option>
                          ))}
                      </select>
                    )}
                    {!isOwner && canManageMembers && (
                      <button
                        onClick={() => {
                          setTransferTarget(member);
                          setShowTransferModal(true);
                        }}
                        className="p-1.5 rounded flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color =
                            'var(--primary-600)';
                          e.currentTarget.style.background =
                            'var(--primary-50)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color =
                            'var(--text-muted)';
                          e.currentTarget.style.background =
                            'transparent';
                        }}
                        title="转让项目所有权"
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                    {!isOwner && canManageMembers && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-1.5 rounded flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--error)';
                          e.currentTarget.style.background =
                            'var(--error-light)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color =
                            'var(--text-muted)';
                          e.currentTarget.style.background =
                            'transparent';
                        }}
                        title="移除成员"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* 转让确认弹窗 */}
      {showTransferModal && transferTarget && (
        <Modal
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setTransferTarget(null);
          }}
          title="转让项目所有权"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferTarget(null);
                }}
              >
                取消
              </Button>
              <Button
                onClick={handleTransferOwnership}
                disabled={transferring}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {transferring ? '转让中...' : '确认转让'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 p-4 rounded-lg"
              style={{
                background: 'var(--warning-light)',
                border: '1px solid var(--warning-dim)',
              }}
            >
              <AlertCircle
                size={20}
                className="flex-shrink-0 mt-0.5"
                style={{ color: 'var(--warning)' }}
              />
              <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <p className="font-semibold mb-1">重要提示</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  转让项目所有权后，您将失去项目所有者权限，并自动降级为项目管理员。此操作不可撤销。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                转让给：
              </p>
              <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                  style={{
                    background: 'var(--primary-100)',
                    color: 'var(--primary-600)',
                  }}
                >
                  {(
                    (transferTarget.nickname ||
                      transferTarget.username ||
                      transferTarget.email)?.[0] ?? '?'
                  ).toUpperCase()}
                </div>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {transferTarget.nickname || transferTarget.username}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {transferTarget.email}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <p>• 新所有者将获得项目的完全控制权</p>
              <p>• 您将成为该项目的管理员</p>
              <p>• 确认转让后，新所有者可以管理项目成员和权限</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default MembersModal;