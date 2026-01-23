import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RefreshCw, X, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { TruncateText } from '../ui/TruncateText';
import { projectsApi, usersApi } from '../../services/apiService';

interface Member {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
    role: string;
    status: string;
  };
  role: string;
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  email: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  role: string;
  status: string;
}

interface MembersModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  MEMBER: '成员',
  EDITOR: '编辑者',
  VIEWER: '查看者',
};

export const MembersModal: React.FC<MembersModalProps> = ({
  isOpen,
  projectId,
  onClose,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('MEMBER');
  const [adding, setAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(
    null
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await projectsApi.getMembers(projectId);
      setMembers((response.data as Member[]) || []);
    } catch (error) {
      setErrorMessage('加载成员列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 根据角色筛选成员
  const filteredMembers = filterRole
    ? members.filter((member) => member.role === filterRole)
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
        const response = await usersApi.search({ search: query, limit: 10 });
        const users = (response.data?.data || []) as UserSearchResult[];

        // 过滤掉已经是成员的用户
        const memberUserIds = members.map((m) => m.userId);
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
    if (isOpen) {
      loadMembers();
      setNewEmail('');
      setNewRole('MEMBER');
      setShowAddForm(false);
      setErrorMessage('');
      setSearchResults([]);
      setSelectedUser(null);
    }
  }, [isOpen, loadMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setAdding(true);
    setErrorMessage('');
    try {
      // 添加成员
      await projectsApi.addMember(projectId, {
        userId: selectedUser.id,
        role: newRole,
      });
      await loadMembers();
      setNewEmail('');
      setNewRole('MEMBER');
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
      await projectsApi.removeMember(projectId, userId);
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

  const handleUpdateRole = async (userId: string, role: string) => {
    setErrorMessage('');
    try {
      await projectsApi.updateMember(projectId, userId, { role });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === userId || m.userId === userId ? { ...m, role } : m
        )
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

  return (
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
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} />
            {errorMessage}
          </div>
        )}

        {/* 添加成员按钮/表单 */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 px-4 border-2 border-dashed border-slate-300 rounded-lg
                       text-slate-500 hover:border-indigo-400 hover:text-indigo-600
                       flex items-center justify-center gap-2 transition-colors"
          >
            <UserPlus size={18} />
            添加成员
          </button>
        ) : (
          <form
            onSubmit={handleAddMember}
            className="p-4 bg-slate-50 rounded-lg border border-slate-200 relative"
          >
            <div className="flex items-center gap-2 mb-3">
              <UserPlus size={18} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">
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
                className="ml-auto p-1 hover:bg-slate-200 rounded"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              {/* 用户搜索输入框 */}
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder="搜索用户（邮箱或用户名）"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  autoComplete="off"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2
                      size={16}
                      className="animate-spin text-slate-400"
                    />
                  </div>
                )}
              </div>

              {/* 搜索结果下拉列表 */}
              {searchResults.length > 0 && !selectedUser && (
                <div className="absolute z-10 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setNewEmail(user.email);
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2 hover:bg-slate-100 text-left border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-medium flex-shrink-0">
                          {(user.nickname ||
                            user.username ||
                            user.email)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            <TruncateText>
                              {user.nickname || user.username}
                            </TruncateText>
                          </p>
                          <p className="text-xs text-slate-500">
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
                <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-medium flex-shrink-0">
                    {(selectedUser.nickname ||
                      selectedUser.username ||
                      selectedUser.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      <TruncateText>
                        {selectedUser.nickname || selectedUser.username}
                      </TruncateText>
                    </p>
                    <p className="text-xs text-slate-500">
                      <TruncateText>{selectedUser.email}</TruncateText>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setNewEmail('');
                    }}
                    className="p-1 hover:bg-indigo-200 rounded flex-shrink-0"
                  >
                    <X size={14} className="text-slate-500" />
                  </button>
                </div>
              )}

              {/* 角色选择和添加按钮 */}
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="OWNER">所有者</option>
                  <option value="ADMIN">管理员</option>
                  <option value="MEMBER">成员</option>
                  <option value="EDITOR">编辑者</option>
                  <option value="VIEWER">查看者</option>
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={adding || !selectedUser}
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
            <span className="text-sm text-slate-500">
              共 {filteredMembers.length} 人
            </span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white text-sm text-slate-700"
            >
              <option value="">所有角色</option>
              <option value="OWNER">所有者</option>
              <option value="ADMIN">管理员</option>
              <option value="MEMBER">成员</option>
              <option value="EDITOR">编辑者</option>
              <option value="VIEWER">查看者</option>
            </select>
          </div>
        )}

        {/* 成员列表 */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">加载中...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {filterRole ? '没有符合条件的成员' : '暂无成员'}
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isOwner = member.role === 'OWNER';
              const displayName =
                member.user.nickname ||
                member.user.username ||
                member.user.email ||
                '未知用户';
              const avatarLetter = displayName[0]?.toUpperCase() || '?';

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium flex-shrink-0">
                    {avatarLetter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      <TruncateText>{displayName}</TruncateText>
                    </p>
                    <p className="text-xs text-slate-500">
                      <TruncateText>
                        {member.user.email || '无邮箱'}
                      </TruncateText>
                    </p>
                  </div>
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleUpdateRole(member.userId, e.target.value)
                    }
                    disabled={isOwner}
                    className={`px-2 py-1 text-xs border border-slate-300 rounded bg-white flex-shrink-0 ${
                      isOwner ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="OWNER">所有者</option>
                    <option value="ADMIN">管理员</option>
                    <option value="MEMBER">成员</option>
                    <option value="EDITOR">编辑者</option>
                    <option value="VIEWER">查看者</option>
                  </select>
                  {!isOwner && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
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
  );
};

export default MembersModal;
