import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — 捕获子组件渲染错误，防止 WebGL/CAD 引擎崩溃导致白屏。
 *
 * 用法：
 * <ErrorBoundary>
 *   <CADEditorDirect />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] CAD 编辑器渲染错误:', error);
    console.error('[ErrorBoundary] 组件栈:', errorInfo.componentStack);
  }

  private handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-[99999]">
          <div className="text-center max-w-md px-6">
            <h1 className="text-xl font-semibold mb-3">CAD 引擎遇到错误，请刷新页面</h1>
            <p className="text-sm text-gray-400 mb-6">
              WebGL 渲染出现异常，刷新页面可恢复编辑。
            </p>
            <button
              onClick={this.handleRefresh}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
