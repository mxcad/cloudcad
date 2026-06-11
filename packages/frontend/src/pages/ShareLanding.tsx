import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, FileText, AlertTriangle, Clock, FileX2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  shareControllerResolveShareNode,
} from '@/api-sdk';

interface ShareFileInfo {
  id: string;
  name: string;
  updatedAt?: string;
}

type LoadState = 'loading' | 'resolved' | 'expired' | 'revoked' | 'not_found';

export const ShareLanding: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<ShareFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [redirecting, setRedirecting] = useState(false);
  const resolvedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    if (resolvedRef.current) return;
    resolvedRef.current = true;

    shareControllerResolveShareNode({ path: { token } })
      .then((result) => {
        setLoading(false);
        if (result.error) {
          const err = result.error as { status?: number };
          if (err.status === 404) {
            setError('分享链接不存在或已撤销');
            setLoadState('not_found');
          } else {
            setError('分享链接解析失败，请稍后重试');
            setLoadState('not_found');
          }
          return;
        }
        const data = result.data as Record<string, unknown> | undefined;
        if (!data || !data.id) {
          setError('分享链接解析失败');
          setLoadState('not_found');
          return;
        }
        const info: ShareFileInfo = {
          id: data.id as string,
          name: (data.name as string) ?? '未知图纸',
          updatedAt: data.updatedAt as string | undefined,
        };
        setFileInfo(info);
        setLoadState('resolved');
      })
      .catch(() => {
        setLoading(false);
        setError('分享链接不存在或已失效');
        setLoadState('not_found');
      });
  }, [token]);

  useEffect(() => {
    if (fileInfo && isAuthenticated && !redirecting) {
      setRedirecting(true);
      redirectTimerRef.current = setTimeout(() => {
        navigate(
          `/cad-editor/${fileInfo.id}?fromShare=1&shareToken=${token}`,
          { replace: true }
        );
      }, 800);
    }
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [fileInfo, isAuthenticated, navigate, token, redirecting]);

  const handleLogin = () => {
    navigate(`/login?redirect=/share/${token}`);
  };

  const pageContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '24px',
  };

  if (loading) {
    return (
      <div style={{ ...pageContainer, gap: '12px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          正在解析分享链接...
        </span>
      </div>
    );
  }

  if (loadState === 'not_found' || (loadState !== 'resolved' && error)) {
    const IconComponent = error?.includes('失效') || error?.includes('过期')
      ? Clock
      : error?.includes('撤销')
        ? FileX2
        : AlertTriangle;

    return (
      <div style={{ ...pageContainer, gap: '16px' }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)' }}>
          分享链接无效
        </div>
        <IconComponent size={40} style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {error}
        </div>
        <Button variant="primary" onClick={() => navigate('/cad-editor', { replace: true })}>
          返回首页
        </Button>
      </div>
    );
  }

  if (authLoading && fileInfo) {
    return (
      <div style={{ ...pageContainer, gap: '12px' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          正在验证登录状态...
        </span>
      </div>
    );
  }

  if (redirecting && fileInfo) {
    return (
      <div style={pageContainer}>
        <Card variant="outlined" padding="none" style={{ maxWidth: '360px', width: '100%' }}>
          <Card.Body>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                文件解析完成
              </div>

              <div style={{
                width: '80px', height: '80px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: '16px', background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
              }}>
                <FileText size={36} style={{ color: 'var(--primary-500)' }} />
              </div>

              <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'center' }}>
                {fileInfo.name}
              </div>

              {fileInfo.updatedAt && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  最后修改: {new Date(fileInfo.updatedAt).toLocaleString()}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <Loader2 size={14} className="animate-spin" />
                即将跳转至编辑器...
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated && fileInfo) {
    return (
      <div style={pageContainer}>
        <Card variant="outlined" padding="none" style={{ maxWidth: '360px', width: '100%' }}>
          <Card.Body>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                你收到了一份图纸分享
              </div>

              <div style={{
                width: '80px', height: '80px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: '16px', background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
              }}>
                <FileText size={36} style={{ color: 'var(--primary-500)' }} />
              </div>

              <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'center' }}>
                {fileInfo.name}
              </div>

              {fileInfo.updatedAt && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  最后修改: {new Date(fileInfo.updatedAt).toLocaleString()}
                </div>
              )}

              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
                登录后即可查看图纸
              </div>

              <Button variant="primary" onClick={handleLogin} style={{ width: '100%' }}>
                登录 / 注册
              </Button>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return null;
};

export default ShareLanding;
