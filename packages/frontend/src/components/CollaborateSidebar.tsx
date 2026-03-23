///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications containing this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import Users from 'lucide-react/dist/esm/icons/users';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Check from 'lucide-react/dist/esm/icons/check';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import styles from './CollaborateSidebar.module.css';

/**
 * 协同侧边栏组件
 * 提供协同功能的创建、加入、退出和列表展示
 *
 * 主题适配：完美主题系统 2.0
 * - 深色主题：Midnight Engineering
 * - 亮色主题：Daylight Clarity
 */
export const CollaborateSidebar: React.FC = () => {
  const { showToast } = useNotification();

  const getCooperate = () => {
    const cooperate = MxCpp.getCurrentMxCAD()?.getCooperate();
    cooperate.init({
      server_addres: APP_COOPERATE_URL,
    });
    return cooperate;
  };

  // 协同数据状态
  const [works, setWorks] = useState<number[]>([]);
  const [currentWorkId, setCurrentWorkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);

  // 获取协同列表
  const fetchWorks = useCallback(async () => {
    try {
      setLoading(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        console.warn('协同对象未初始化');
        return;
      }

      cooperate.getWorks((workList: number[]) => {
        console.log('获取协同列表成功:', workList);
        setWorks(workList);
        setLoading(false);
      });
    } catch (error) {
      console.error('获取协同列表失败:', error);
      setLoading(false);
    }
  }, []);

  // 组件加载时获取协同列表
  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  // 创建协同
  const handleCreateWork = useCallback(async () => {
    try {
      setCreating(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        setCreating(false);
        return;
      }

      cooperate.createWrok((workid: number) => {
        setCreating(false);
        if (workid > 0) {
          console.log('创建协同成功, workId:', workid);
          fetchWorks();
          showToast(`协同创建成功！协同ID: ${workid}`, 'success');
        } else {
          const errorCode = -workid;
          console.log('创建协同失败, error code:', errorCode);
          if (errorCode === 4) {
            showToast('协同已存在，您已在协同中', 'warning');
          } else {
            showToast(`创建协同失败，错误码: ${errorCode}`, 'error');
          }
        }
      });
    } catch (error) {
      console.error('创建协同失败:', error);
      setCreating(false);
      showToast('创建协同失败', 'error');
    }
  }, [fetchWorks, showToast]);

  // 加入协同
  const handleJoinWork = useCallback(
    async (workId: number) => {
      try {
        setJoiningWorkId(workId);
        const cooperate = getCooperate();
        if (!cooperate) {
          showToast('协同对象未初始化', 'error');
          setJoiningWorkId(null);
          return;
        }

        cooperate.joinWork(workId, async (iRet: number) => {
          setJoiningWorkId(null);
          if (iRet === 0) {
            console.log('加入协同成功, workId:', workId);
            setCurrentWorkId(workId);
          } else {
            console.log('加入协同失败, error code:', iRet);
            if (iRet === 17) {
              setCurrentWorkId(workId);
            } else {
              showToast(`加入协同失败，错误码: ${iRet}`, 'error');
            }
          }
        });
      } catch (error) {
        console.error('加入协同失败:', error);
        setJoiningWorkId(null);
        showToast('加入协同失败', 'error');
      }
    },
    [showToast]
  );

  // 退出协同
  const handleExitWork = useCallback(async () => {
    try {
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        return;
      }

      const ret = cooperate.exitWrok();
      if (ret === 0) {
        console.log('退出协同成功');
        setCurrentWorkId(null);
        fetchWorks();
        showToast('已退出协同', 'success');
      } else {
        console.log('退出协同失败, error code:', ret);
        showToast(`退出协同失败，错误码: ${ret}`, 'error');
      }
    } catch (error) {
      console.error('退出协同失败:', error);
      showToast('退出协同失败', 'error');
    }
  }, [fetchWorks, showToast]);

  // 计算会话数量
  const sessionCount = useMemo(() => works.length, [works]);

  return (
    <div className={styles.container} data-tour="collaborators-panel">
      {/* 标题栏 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Users size={18} />
          </div>
          <span className={styles.headerTitle}>协同</span>
          {sessionCount > 0 && (
            <span className={styles.headerBadge}>
              {sessionCount} 个会话
            </span>
          )}
        </div>
      </div>

      {/* 操作按钮区 */}
      <div className={styles.actionsBar}>
        <button
          onClick={handleCreateWork}
          disabled={creating || currentWorkId !== null}
          className={`${styles.primaryButton} ${styles.ripple}`}
        >
          {creating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          <span>{creating ? '创建中...' : '创建协同'}</span>
        </button>

        <button
          onClick={fetchWorks}
          disabled={loading}
          className={`${styles.iconButton} ${styles.ripple}`}
          title="刷新列表"
        >
          <RefreshCw
            size={18}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* 当前协同状态 */}
      {currentWorkId !== null && (
        <div className={styles.currentSession}>
          <div className={styles.sessionInfo}>
            <div className={styles.sessionLeft}>
              <div className={styles.statusIndicator}>
                <div className={styles.statusDot} />
              </div>
              <span className={styles.sessionLabel}>
                当前协同: <span className={styles.sessionId}>{currentWorkId}</span>
              </span>
            </div>
            <button
              onClick={handleExitWork}
              className={`${styles.exitButton} ${styles.ripple}`}
            >
              退出
            </button>
          </div>
        </div>
      )}

      {/* 协同列表 */}
      <div className={styles.sessionList}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>加载中...</span>
          </div>
        ) : works.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Users />
            </div>
            <div className={styles.emptyTitle}>暂无协同会话</div>
            <div className={styles.emptyDescription}>
              点击「创建协同」开始协作
            </div>
          </div>
        ) : (
          works.map((workId, index) => (
            <div
              key={workId}
              className={`${styles.sessionCard} ${currentWorkId === workId ? styles.active : ''}`}
              style={{ animationDelay: `${Math.min(index * 0.05, 0.35)}s` }}
              onClick={() => currentWorkId !== workId && currentWorkId === null && handleJoinWork(workId)}
            >
              <div className={styles.sessionCardLeft}>
                <div className={styles.sessionIcon}>
                  <Users size={18} />
                </div>
                <div className={styles.sessionDetails}>
                  <div className={styles.sessionName}>协同 {workId}</div>
                  <div className={styles.sessionMeta}>
                    <span>等待加入</span>
                  </div>
                </div>
              </div>

              {currentWorkId === workId ? (
                <span className={styles.joinedBadge}>
                  <Check size={12} />
                  已加入
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoinWork(workId);
                  }}
                  disabled={joiningWorkId !== null || currentWorkId !== null}
                  className={`${styles.joinButton} ${styles.ripple}`}
                >
                  {joiningWorkId === workId ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    '加入'
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CollaborateSidebar;
