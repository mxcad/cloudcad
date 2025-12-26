import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RefreshCw, X, UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { projectsApi } from '../../services/apiService';

interface Member {
  id?: string;
  userId?: string;
  nickname?: string;
  username?: string;
  email?: string;
  role: string;
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
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('MEMBER');
  const [adding, setAdding] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectsApi.getMembers(projectId);
      setMembers((response.data as Member[]) || []);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadMembers();
      setNewEmail('');
      setNewRole('MEMBER');
      setShowAddForm(false);
    }
  }, [isOpen, loadMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setAdding(true);
    try {
      await projectsApi.addMember(projectId, {
        userId: newEmail.trim(),
        role: newRole,
      });
      await loadMembers();
      setNewEmail('');
      setNewRole('MEMBER');
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add member:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await projectsApi.removeMember(projectId, userId);
      setMembers((prev) =>
        prev.filter((m) => m.id !== userId && m.userId !== userId)
      );
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await projectsApi.updateMember(projectId, userId, { role });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === userId || m.userId === userId ? { ...m, role } : m
        )
      );
    } catch (error) {
      console.error('Failed to update role:', error);
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
            className="p-4 bg-slate-50 rounded-lg border border-slate-200"
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
                }}
                className="ml-auto p-1 hover:bg-slate-200 rounded"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="输入用户邮箱"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="OWNER">所有者</option>
                  <option value="ADMIN">管理员</option>
                  <option value="MEMBER">成员</option>
                  <option value="VIEWER">查看者</option>
                </select>
                <Button type="submit" size="sm" disabled={adding || !newEmail.trim()}>
                  {adding ? '添加中...' : '添加'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* 成员列表 */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">加载中...</span>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-slate-500">暂无成员</div>
          ) : (
            members.map((member) => (
              <div
                key={member.id || member.userId}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                  {(member.nickname || member.username || member.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {member.nickname || member.username || member.email}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{member.email}</p>
                </div>
                <select
                  value={member.role}
                  onChange={(e) =>
                    handleUpdateRole(member.id || member.userId || '', e.target.value)
                  }
                  className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                >
                  <option value="OWNER">所有者</option>
                  <option value="ADMIN">管理员</option>
                  <option value="MEMBER">成员</option>
                  <option value="VIEWER">查看者</option>
                </select>
                <button
                  onClick={() => handleRemoveMember(member.id || member.userId || '')}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                  title="移除成员"
                >
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MembersModal;
