import { Users, UserPlus, RefreshCw, Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { APP_COOPERATE_URL } from '@/constants/appConfig';

/**
 * 协同侧边栏组件
 * 提供协同功能的创建、加入、退出和列表展示
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
      {/* 侧边栏 */}
      <div className="bg-[#1E2129] text-white flex flex-col transition-all duration-200 ease-in-out w-full h-full">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#4A5568]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#4F46E5]" />
            <span className="font-semibold text-sm text-[#E2E8F0]">协同</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 p-3 border-b border-[#4A5568]">
          <button
            onClick={handleCreateWork}
            disabled={creating || currentWorkId !== null}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
              creating || currentWorkId !== null
                ? 'bg-[#2D3748] text-[#718096] cursor-not-allowed'
                : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'
            }`}
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
            className="p-2 bg-[#252B3A] hover:bg-[#333A47] rounded transition-colors"
            title="刷新列表"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#94A3B8] ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* 当前协同状态 */}
        {currentWorkId !== null && (
          <div className="px-3 py-2 border-b border-[#4A5568] bg-[#252B3A]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-[#E2E8F0]">
                  当前协同: <strong>{currentWorkId}</strong>
                </span>
              </div>
              <button
                onClick={handleExitWork}
                className="px-2 py-1 text-xs bg-[#EF4444] hover:bg-[#DC2626] text-white rounded transition-colors"
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
              <Loader2 className="w-6 h-6 text-[#4F46E5] animate-spin" />
            </div>
          ) : works.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#94A3B8]">
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
                  className={`flex items-center justify-between p-3 rounded transition-colors ${
                    currentWorkId === workId
                      ? 'bg-[#4F46E5]/20 border border-[#4F46E5]'
                      : 'bg-[#252B3A] hover:bg-[#333A47]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#94A3B8]" />
                    <span className="text-sm text-[#E2E8F0]">
                      协同 {workId}
                    </span>
                  </div>
                  {currentWorkId === workId ? (
                    <span className="text-xs text-green-400">已加入</span>
                  ) : (
                    <button
                      onClick={() => handleJoinWork(workId)}
                      disabled={
                        joiningWorkId !== null || currentWorkId !== null
                      }
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        joiningWorkId === workId
                          ? 'bg-[#4F46E5] text-white'
                          : joiningWorkId !== null || currentWorkId !== null
                            ? 'bg-[#2D3748] text-[#718096] cursor-not-allowed'
                            : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white'
                      }`}
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
