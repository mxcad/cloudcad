import React, { useState, useEffect } from 'react';
import { X, FileText, Box, Check } from 'lucide-react';
import { galleryApi } from '../../services/api';

type GalleryType = 'drawings' | 'blocks';

interface GalleryTypeData {
  id: number;
  pid: number;
  name: string;
  pname: string;
  status: number;
}

interface AddToGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  nodeId: string;
  fileName: string;
}

export const AddToGalleryModal: React.FC<AddToGalleryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  nodeId,
  fileName,
}) => {
  const [galleryType, setGalleryType] = useState<GalleryType>('drawings');
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 获取分类列表
  const fetchTypes = async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      if (response.data?.code === 'success') {
        setTypes(response.data.result?.allblocks || []);
      }
    } catch (error) {
      // 错误已通过 alert 显示
    } finally {
      setLoading(false);
    }
  };

  // 初始化时获取分类列表
  useEffect(() => {
    if (isOpen) {
      fetchTypes();
    }
  }, [isOpen, galleryType]);

  // 获取一级分类列表
  const firstLevelTypes = types.filter((t) => t.pid === 0);
  const selectedFirstTypeData = firstLevelTypes.find(
    (t) => t.id === selectedFirstType
  );

  // 获取二级分类列表
  const secondLevelTypes = types.filter((t) => t.pid === selectedFirstType);

  // 处理提交
  const handleSubmit = async () => {
    if (selectedSecondType === -1) {
      alert('请选择分类');
      return;
    }

    try {
      setSubmitting(true);

      // 调用后端 API 添加文件到图库
      const response = await galleryApi.addToGallery(galleryType, {
        nodeId,
        firstType: selectedFirstType,
        secondType: selectedSecondType,
      });

      // 检查响应状态码和响应体（201 表示创建成功）
      if (
        (response.status === 200 || response.status === 201) &&
        response.data?.code === 'success'
      ) {
        alert('添加成功！');
        onSuccess();
        onClose();
      } else if (response.status === 400) {
        // 处理业务错误（400状态码）
        const errorMessage = response.data?.message || '添加失败';
        alert(errorMessage);
      } else {
        // 其他错误
        const errorMessage = response.data?.message || '添加失败，请稍后重试';
        alert(errorMessage);
      }
    } catch (error) {
      // 处理网络错误或服务器错误
      if (
        (
          error as Error & {
            response?: { status?: number; data?: { message?: string } };
          }
        ).response
      ) {
        // 服务器返回了错误响应
        const status = (
          error as Error & {
            response?: { status?: number; data?: { message?: string } };
          }
        ).response.status;
        const errorMessage =
          (error as Error & { response?: { data?: { message?: string } } })
            .response.data?.message || '添加失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`添加失败: ${errorMessage}`);
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        alert('网络错误，请检查网络连接');
      } else {
        // 其他错误
        alert('添加失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 重置选择
  const resetSelection = () => {
    setSelectedFirstType(-1);
    setSelectedSecondType(-1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">添加到图库</h2>
            <p className="text-sm text-gray-500 mt-1">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 图库类型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择图库类型
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGalleryType('drawings');
                  resetSelection();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  galleryType === 'drawings'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText size={16} />
                图纸库
              </button>
              <button
                onClick={() => {
                  setGalleryType('blocks');
                  resetSelection();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  galleryType === 'blocks'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Box size={16} />
                图块库
              </button>
            </div>
          </div>

          {/* 分类选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择分类
            </label>
            <div className="space-y-3">
              {/* 一级分类 */}
              <select
                value={selectedFirstType}
                onChange={(e) => {
                  setSelectedFirstType(Number(e.target.value));
                  setSelectedSecondType(-1);
                }}
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value={-1}>请选择一级分类</option>
                {firstLevelTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>

              {/* 二级分类 */}
              <select
                value={selectedSecondType}
                onChange={(e) => setSelectedSecondType(Number(e.target.value))}
                disabled={!selectedFirstTypeData || loading}
                className={`w-full px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                  !selectedFirstTypeData
                    ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <option value={-1}>
                  {selectedFirstTypeData
                    ? `请选择${selectedFirstTypeData.name}的子分类`
                    : '请先选择一级分类'}
                </option>
                {secondLevelTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              💡 提示：选择分类后，该文件将被添加到图库中，方便后续浏览和管理。
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedSecondType === -1 || submitting}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                添加中...
              </>
            ) : (
              <>
                <Check size={16} />
                添加到图库
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
