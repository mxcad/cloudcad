import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MxCADView } from 'mxcad-app';
import 'mxcad-app/style';


interface CADEditorDirectProps {
  fileUrl?: string;
}

export const CADEditorDirect: React.FC<CADEditorDirectProps> = ({ fileUrl }) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mxcadView, setMxcadView] = useState<MxCADView | null>(null);
  const [stylesLoaded, setStylesLoaded] = useState(false);

  console.log('[CADEditorDirect] 组件渲染 - fileUrl:', fileUrl);
  // 初始化 MxCADView
  useEffect(() => {
    if (!containerRef.current || mxcadView) return;

    console.log('[CADEditorDirect] 🚀 初始化 MxCADView');

    const initMxCAD = async () => {
      try {
        const view = new MxCADView({
          rootContainer: containerRef.current!,
          openFile: fileUrl,
        });

        await view.create();
        setMxcadView(view);
        console.log('[CADEditorDirect] ✅ MxCADView 创建完成');
      } catch (error) {
        console.error('[CADEditorDirect] ❌ MxCADView 创建失败:', error);
      }
    };

    initMxCAD();
  }, [fileUrl, mxcadView]);

  // 文件切换
  useEffect(() => {
    if (mxcadView && fileUrl) {
      console.log('[CADEditorDirect] 📂 打开文件:', fileUrl);
      mxcadView.mxcad.openWebFile(fileUrl);
    }
  }, [fileUrl, mxcadView]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
      }}
    >
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/projects')}
        className="fixed top-4 left-4 z-[9999] flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 text-sm font-medium text-slate-700"
      >
        <ArrowLeft size={16} />
        返回项目列表
      </button>

      {/* MxCAD 容器 */}
      <div
        ref={containerRef}
        className="mxcad-container"
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};