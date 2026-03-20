///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import Users from 'lucide-react/dist/esm/icons/users';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import React, { useCallback, useEffect, useState } from 'react';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { APP_COOPERATE_URL } from '@/constants/appConfig';

/**
 * 协同侧边栏组件
 * 提供协同功能的创建、加入、退出和列表展示
 * 
 * 主题适配：使用 CSS 变量，支持深色/亮色主题
 * CloudCAD 完美主题系统 2.0
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

  return (
    <>
      {/* 侧边栏 - 使用主题 CSS 变量 */}
      <div 
        className="flex flex-col w-full h-full transition-all duration-200 ease-in-out"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)'
        }}
      >
        {/* 标题栏 */}
        <div 
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <div className="flex items-center gap-2">
            <Users 
              className="w-5 h-5" 
              style={{ color: 'var(--primary-500)' }} 
            />
            <span 
              className="font-semibold text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              协同
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div 
          className="flex gap-2 p-3"
          style={{
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <button
            onClick={handleCreateWork}
            disabled={creating || currentWorkId !== null}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: creating || currentWorkId !== null
                ? 'var(--bg-tertiary)'
                : 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
              color: creating || currentWorkId !== null
                ? 'var(--text-muted)'
                : 'white',
              cursor: creating || currentWorkId !== null ? 'not-allowed' : 'pointer',
              boxShadow: creating || currentWorkId !== null
                ? 'none'
                : 'var(--shadow-sm)'
            }}
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {creating ? '创建中...' : '创建协同'}
          </button>

          <button
            onClick={fetchWorks}
            disabled={loading}
            className="p-2 rounded transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)'
            }}
            title="刷新列表"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </button>
        </div>

        {/* 当前协同状态 */}
        {currentWorkId !== null && (
          <div 
            className="px-3 py-2"
            style={{
              borderBottom: '1px solid var(--border-default)',
              backgroundColor: 'var(--primary-50)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--success)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  当前协同: <strong>{currentWorkId}</strong>
                </span>
              </div>
              <button
                onClick={handleExitWork}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  backgroundColor: 'var(--error)',
                  color: 'white'
                }}
              >
                退出
              </button>
            </div>
          </div>
        )}

        {/* 协同列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 
                className="w-6 h-6 animate-spin" 
                style={{ color: 'var(--primary-500)' }} 
              />
            </div>
          ) : works.length === 0 ? (
            <div 
              className="flex flex-col items-center justify-center py-8"
              style={{ color: 'var(--text-muted)' }}
            >
              <Users className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-xs text-center px-4">暂无协同会话</p>
              <p className="text-xs text-center px-4 mt-1">
                点击「创建协同」开始协作
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {works.map((workId) => (
                <div
                  key={workId}
                  className="flex items-center justify-between p-3 rounded transition-colors"
                  style={{
                    backgroundColor: currentWorkId === workId
                      ? 'var(--primary-50)'
                      : 'var(--bg-tertiary)',
                    border: currentWorkId === workId
                      ? '1px solid var(--primary-300)'
                      : '1px solid transparent'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Users 
                      className="w-4 h-4" 
                      style={{ color: 'var(--text-tertiary)' }} 
                    />
                    <span 
                      className="text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      协同 {workId}
                    </span>
                  </div>
                  {currentWorkId === workId ? (
                    <span 
                      className="text-xs"
                      style={{ color: 'var(--success)' }}
                    >
                      已加入
                    </span>
                  ) : (
                    <button
                      onClick={() => handleJoinWork(workId)}
                      disabled={joiningWorkId !== null || currentWorkId !== null}
                      className="px-2 py-1 text-xs rounded transition-all"
                      style={{
                        background: joiningWorkId === workId || joiningWorkId !== null || currentWorkId !== null
                          ? 'var(--bg-secondary)'
                          : 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
                        color: joiningWorkId === workId || joiningWorkId !== null || currentWorkId !== null
                          ? 'var(--text-muted)'
                          : 'white',
                        cursor: joiningWorkId !== null || currentWorkId !== null ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {joiningWorkId === workId ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        '加入'
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CollaborateSidebar;