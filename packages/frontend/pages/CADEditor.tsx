import React, { useEffect, useRef } from 'react';
import 'mxcad-app/style';
import { MxCADView } from 'mxcad-app';

interface CADEditorProps {
  fileUrl?: string;
}

export const CADEditor: React.FC<CADEditorProps> = ({ fileUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mxcadViewRef = useRef<MxCADView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化 MxCAD 视图
    const mxcadView = new MxCADView({
      rootContainer: containerRef.current,
      openFile: fileUrl,
    });

    mxcadView.create();
    mxcadViewRef.current = mxcadView;

    // 清理函数
    return () => {
      // MxCAD 会自动处理清理
      mxcadViewRef.current = null;
    };
  }, [fileUrl]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
      }}
    />
  );
};
