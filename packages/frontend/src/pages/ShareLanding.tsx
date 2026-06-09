import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  shareControllerResolveShareNode,
} from '@/api-sdk';

interface ShareFileInfo {
  id: string;
  name: string;
}

export const ShareLanding: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<ShareFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const resolvedRef = useRef(false);

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
          setError('分享链接不存在或已失效');
          return;
        }
        const data = result.data as Record<string, unknown> | undefined;
        if (!data || !data.id) {
          setError('分享链接解析失败');
          return;
        }
        const info: ShareFileInfo = {
          id: data.id as string,
          name: (data.name as string) ?? '未知图纸',
        };
        setFileInfo(info);
      })
      .catch(() => {
        setLoading(false);
        setError('分享链接不存在或已失效');
      });
  }, [token]);

  useEffect(() => {
    if (fileInfo && isAuthenticated) {
      navigate(
        `/cad-editor/${fileInfo.id}?fromShare=1&shareToken=${token}`,
        { replace: true }
      );
    }
  }, [fileInfo, isAuthenticated, navigate, token]);

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

  if (error) {
    return (
      <div style={{ ...pageContainer, gap: '16px' }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)' }}>
          分享链接无效
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
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
