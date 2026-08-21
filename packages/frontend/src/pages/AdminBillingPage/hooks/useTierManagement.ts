import { useState, useEffect, useCallback } from 'react';
import {
  vipAdminControllerGetAllTiers,
  vipAdminControllerCreateTier,
  vipAdminControllerUpdateTier,
  vipAdminControllerDeactivateTier,
  vipAdminControllerDeleteTierPermanent,
  vipAdminControllerGetAllDurations,
  vipAdminControllerCreateDuration,
  vipAdminControllerUpdateDuration,
  vipAdminControllerDeactivateDuration,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { useTierConfigRegistry } from '@/hooks/useTierConfigRegistry';
import { globalShowToast } from '@/utils/notificationEvents';
import { bpsToDecimal, decimalToBps } from '../constants';
import { FREE_TIER_LEVEL } from '@/constants/vip';
import type { VipTierItem, DurationItem } from '../types';

export interface TierFormState {
  level: number;
  name: string;
  baseMonthlyPriceYuan: number;
  isActive: boolean;
  configs: Record<string, unknown>;
}

export interface DurationFormState {
  months: number;
  multiplierDecimal: number;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

export interface DeactivateConfirm {
  type: 'tier' | 'duration';
  id: string;
}

export interface DeleteTierConfirm {
  id: string;
}

export function useTierManagement() {
  const { entries: registryEntries, loading: registryLoading } =
    useTierConfigRegistry();

  const [tiers, setTiers] = useState<VipTierItem[]>([]);
  const [durations, setDurations] = useState<DurationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierEditingId, setTierEditingId] = useState<string | null>(null);
  /** 是否在编辑系统默认等级（level 0）：名称/价格/上下架锁定，仅权益配置可改 */
  const [tierEditingFreeTier, setTierEditingFreeTier] = useState(false);
  const [tierForm, setTierForm] = useState<TierFormState>({
    level: 1,
    name: '',
    baseMonthlyPriceYuan: 0,
    isActive: true,
    configs: {},
  });

  const [durationModalOpen, setDurationModalOpen] = useState(false);
  const [durationEditingId, setDurationEditingId] = useState<string | null>(
    null
  );
  const [durationForm, setDurationForm] = useState<DurationFormState>({
    months: 1,
    multiplierDecimal: 1,
    label: '',
    isActive: true,
    sortOrder: 1,
  });

  const [deactivateConfirm, setDeactivateConfirm] =
    useState<DeactivateConfirm | null>(null);
  const [deleteTierConfirm, setDeleteTierConfirm] =
    useState<DeleteTierConfirm | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      globalShowToast(message, type);
    },
    []
  );

  const loadTiers = useCallback(async () => {
    setLoading(true);
    try {
      const [tiersRes, durationsRes] = await Promise.all([
        vipAdminControllerGetAllTiers({ throwOnError: true }),
        vipAdminControllerGetAllDurations({ throwOnError: true }),
      ]);
      const tiersData = tiersRes?.data as VipTierItem[] | undefined;
      if (Array.isArray(tiersData)) setTiers(tiersData);
      const durationsData = durationsRes?.data as DurationItem[] | undefined;
      if (Array.isArray(durationsData)) setDurations(durationsData);
    } catch (error) {
      showToast(getErrorMessage(error) || t('加载数据失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  const openCreateTier = useCallback(() => {
    setTierEditingId(null);
    setTierEditingFreeTier(false);
    const defaults: Record<string, unknown> = {};
    for (const entry of registryEntries) {
      defaults[entry.key] =
        entry.defaultValue ?? (entry.type === 'number' ? 0 : false);
    }
    setTierForm({
      level: 1,
      name: '',
      baseMonthlyPriceYuan: 0,
      isActive: true,
      configs: defaults,
    });
    setTierModalOpen(true);
  }, [registryEntries]);

  const openEditTier = useCallback(
    (item: VipTierItem) => {
      setTierEditingId(item.id);
      setTierEditingFreeTier(item.level === FREE_TIER_LEVEL);
      const defaults: Record<string, unknown> = {};
      for (const entry of registryEntries) {
        defaults[entry.key] =
          (item.configs as Record<string, unknown>)[entry.key] ??
          entry.defaultValue ??
          (entry.type === 'number' ? 0 : false);
      }
      setTierForm({
        level: item.level,
        name: item.name,
        baseMonthlyPriceYuan: item.baseMonthlyPrice / 100,
        isActive: item.isActive,
        configs: defaults,
      });
      setTierModalOpen(true);
    },
    [registryEntries]
  );

  const openCreateDuration = useCallback(() => {
    setDurationEditingId(null);
    setDurationForm({
      months: 1,
      multiplierDecimal: 1,
      label: '',
      isActive: true,
      sortOrder: 1,
    });
    setDurationModalOpen(true);
  }, []);

  const openEditDuration = useCallback((item: DurationItem) => {
    setDurationEditingId(item.id);
    setDurationForm({
      months: item.months,
      multiplierDecimal: bpsToDecimal(item.multiplierBps),
      label: item.label,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
    setDurationModalOpen(true);
  }, []);

  const handleSaveTier = useCallback(async () => {
    setSaving(true);
    try {
      const body = {
        name: tierForm.name,
        baseMonthlyPrice: Math.round(tierForm.baseMonthlyPriceYuan * 100),
        isActive: tierForm.isActive,
        configs: tierForm.configs as Record<string, unknown>,
      };
      if (tierEditingId) {
        await vipAdminControllerUpdateTier({
          path: { id: tierEditingId },
          body,
          throwOnError: true,
        });
        showToast(t('修改成功'), 'success');
      } else {
        await vipAdminControllerCreateTier({
          body: { ...body, level: tierForm.level },
          throwOnError: true,
        });
        showToast(t('创建成功'), 'success');
      }
      setTierModalOpen(false);
      loadTiers();
    } catch (error) {
      showToast(getErrorMessage(error) || t('操作失败'), 'error');
    } finally {
      setSaving(false);
    }
  }, [tierForm, tierEditingId, loadTiers, showToast]);

  const handleSaveDuration = useCallback(async () => {
    setSaving(true);
    try {
      const body = {
        months: durationForm.months,
        multiplierBps: decimalToBps(durationForm.multiplierDecimal),
        label: durationForm.label,
        isActive: durationForm.isActive,
        sortOrder: durationForm.sortOrder,
      };
      if (durationEditingId) {
        await vipAdminControllerUpdateDuration({
          path: { id: durationEditingId },
          body,
          throwOnError: true,
        });
        showToast(t('修改成功'), 'success');
      } else {
        await vipAdminControllerCreateDuration({
          body,
          throwOnError: true,
        });
        showToast(t('创建成功'), 'success');
      }
      setDurationModalOpen(false);
      loadTiers();
    } catch (error) {
      showToast(getErrorMessage(error) || t('操作失败'), 'error');
    } finally {
      setSaving(false);
    }
  }, [durationForm, durationEditingId, loadTiers, showToast]);

  const handleDeactivate = useCallback(async () => {
    if (!deactivateConfirm) return;
    try {
      if (deactivateConfirm.type === 'tier') {
        await vipAdminControllerDeactivateTier({
          path: { id: deactivateConfirm.id },
          throwOnError: true,
        });
      } else {
        await vipAdminControllerDeactivateDuration({
          path: { id: deactivateConfirm.id },
          throwOnError: true,
        });
      }
      showToast(t('已下架'), 'success');
      setDeactivateConfirm(null);
      loadTiers();
    } catch (error) {
      showToast(getErrorMessage(error) || t('下架失败'), 'error');
    }
  }, [deactivateConfirm, loadTiers, showToast]);

  const handleDeleteTier = useCallback(async () => {
    if (!deleteTierConfirm) return;
    setSaving(true);
    try {
      await vipAdminControllerDeleteTierPermanent({
        path: { id: deleteTierConfirm.id },
        throwOnError: true,
      });
      showToast(t('删除成功'), 'success');
      setDeleteTierConfirm(null);
      loadTiers();
    } catch (error) {
      showToast(
        getErrorMessage(error) || t('删除失败，该等级可能已有订单引用'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }, [deleteTierConfirm, loadTiers, showToast]);

  const registeredConfigKeys = registryEntries.filter(
    (e) => e.type === 'number' || e.type === 'bool'
  );

  return {
    tiers,
    durations,
    loading,
    saving,
    registeredConfigKeys,
    registryLoading,
    tierModalOpen,
    tierEditingId,
    tierEditingFreeTier,
    tierForm,
    setTierForm,
    durationModalOpen,
    durationEditingId,
    durationForm,
    setDurationForm,
    deactivateConfirm,
    setDeactivateConfirm,
    deleteTierConfirm,
    setDeleteTierConfirm,
    handleDeleteTier,
    loadTiers,
    openCreateTier,
    openEditTier,
    openCreateDuration,
    openEditDuration,
    handleSaveTier,
    handleSaveDuration,
    handleDeactivate,
    setTierModalOpen,
    setDurationModalOpen,
  };
}
