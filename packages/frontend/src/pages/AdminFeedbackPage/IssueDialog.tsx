import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '@/languages';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import { usersControllerSearchUsers } from '@/api-sdk';
import type {
  FeedbackRewardResponseDto,
  UserResponseDto,
} from '@/api-sdk';
import {
  FEEDBACK_TIER_OPTIONS,
  FEEDBACK_DURATION_OPTIONS,
} from '@/constants/feedback';
import { useIssueReward } from './useFeedbackAdmin';

/** 发放账号（预选=反馈提交者，或客服搜索结果；仅消费 id/email/username/nickname） */
type IssueAccount = {
  id: string;
  email: string;
  username: string;
  nickname?: string | null;
};

interface IssueDialogProps {
  isOpen: boolean;
  reward: FeedbackRewardResponseDto | null;
  /** 反馈联系方式（客服凭此联系提交者核实身份；匿名反馈为 null） */
  contact?: string | null;
  onClose: () => void;
  onIssued: () => void;
}

const TIER_OPTIONS = FEEDBACK_TIER_OPTIONS.map((o) => ({
  value: o.value,
  label: t(o.labelKey),
}));
const DURATION_OPTIONS = FEEDBACK_DURATION_OPTIONS.map((o) => ({
  value: o.value,
  label: t(o.labelKey),
}));

/**
 * 发放奖励弹窗（客服）：按邮箱/用户名搜索目标账号 → 绑定 → 填核实备注 → 发放。
 * 匿名反馈的认领必须在此绑定一个真实账号（奖励不能匿名）。
 */
export const IssueDialog: React.FC<IssueDialogProps> = ({
  isOpen,
  reward,
  contact,
  onClose,
  onIssued,
}) => {
  const { showToast } = useNotification();
  const issue = useIssueReward();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserResponseDto[]>([]);
  const [selected, setSelected] = useState<IssueAccount | null>(null);
  const [remark, setRemark] = useState('');
  const [tier, setTier] = useState('');
  const [duration, setDuration] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setUsers([]);
      // 默认发放账号 = 反馈提交者（登录用户提交）；匿名反馈（submitter=null）
      // 则保持空，须客服搜索/绑定账号
      setSelected(reward?.submitter ?? null);
      setRemark('');
      setTier('');
      setDuration('');
    }
  }, [isOpen, reward]);

  const handleSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await usersControllerSearchUsers({
        throwOnError: true,
        query: { search: q, page: 1, limit: 20 },
      });
      const d = res.data as { users: UserResponseDto[] } | undefined;
      setUsers(d?.users ?? []);
      if ((d?.users ?? []).length === 0) {
        showToast(t('未找到匹配用户'), 'warning');
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSearching(false);
    }
  }, [search, showToast]);

  const handleSubmit = useCallback(async () => {
    if (!reward) return;
    if (!selected) {
      showToast(t('请先选择发放账号'), 'warning');
      return;
    }
    if (!remark.trim()) {
      showToast(t('请填写客服核实备注'), 'warning');
      return;
    }
    try {
      await issue.mutateAsync({
        id: reward.id,
        body: {
          userId: selected.id,
          remark: remark.trim(),
          vipTierLevel: tier ? Number(tier) : undefined,
          durationDays: duration ? Number(duration) : undefined,
        },
      });
      showToast(t('奖励已发放'), 'success');
      onIssued();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  }, [reward, selected, remark, tier, duration, issue, showToast, onIssued, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('发放奖励')}
      maxWidth="max-w-[520px]"
      closeOnOverlayClick={!issue.isPending}
    >
      {reward && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[var(--border-default)] p-3 text-sm space-y-1 bg-[var(--bg-secondary)]">
            <p className="font-mono">{reward.feedbackCode}</p>
            <p className="text-[var(--text-secondary)]">{reward.feedbackTitle}</p>
            {contact && (
              <p className="text-[var(--text-secondary)]">
                {t('联系方式')}：{contact}
              </p>
            )}
            <p>
              {t('奖励：VIP{level} {days} 天', {
                level: reward.vipTierLevel,
                days: reward.durationDays,
              })}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">{t('发放账号')}</label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('输入邮箱或用户名搜索')}
                disabled={issue.isPending || searching}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
              />
              <Button
                variant="secondary"
                onClick={handleSearch}
                loading={searching}
                icon={Search}
              >
                {t('搜索')}
              </Button>
            </div>
            {users.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-[var(--border-default)] rounded-lg divide-y divide-[var(--border-subtle)]">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelected(u)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] ${
                      selected?.id === u.id ? 'bg-[var(--bg-tertiary)]' : ''
                    }`}
                  >
                    <span className="font-medium">{u.nickname || u.username}</span>
                    <span className="ml-2 text-[var(--text-tertiary)]">
                      {u.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <p className="text-xs text-green-700">
                {t('已选择：{name}（{email}）', {
                  name: selected.nickname || selected.username,
                  email: selected.email,
                })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              {t('客服核实备注（必填）')}
            </label>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('记录核实过程，如：凭查询码确认身份，已核验注册信息')}
              disabled={issue.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                {t('覆盖等级（选填）')}
              </label>
              <Select
                value={tier}
                onChange={setTier}
                options={[{ value: '', label: t('沿用采纳等级') }, ...TIER_OPTIONS]}
                disabled={issue.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                {t('覆盖时长（选填）')}
              </label>
              <Select
                value={duration}
                onChange={setDuration}
                options={[{ value: '', label: t('沿用采纳时长') }, ...DURATION_OPTIONS]}
                disabled={issue.isPending}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={issue.isPending}>
              {t('取消')}
            </Button>
            <Button onClick={handleSubmit} loading={issue.isPending}>
              {t('确认发放')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
