import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cooperateControllerResolveShare } from '@/api-sdk';

export const ShareLanding: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      return;
    }

    cooperateControllerResolveShare({ path: { token } })
      .then((result) => {
        if (result.error) {
          setError('分享链接不存在或已失效');
          return;
        }
        const data = result.data as { fileId: string };
        if (data?.fileId) {
          navigate(`/cad-editor/${data.fileId}?fromShare=1&shareToken=${token}`, { replace: true });
        } else {
          setError('分享链接解析失败');
        }
      })
      .catch(() => {
        setError('分享链接不存在或已失效');
      });
  }, [token, navigate]);

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--bg-primary)',
          gap: '16px',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          分享链接无效
        </div>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {error}
        </div>
        <button
          onClick={() => navigate('/cad-editor', { replace: true })}
          style={{
            marginTop: '8px',
            padding: '8px 16px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'white',
            background: 'var(--primary-500)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--border-default)',
          borderTopColor: 'var(--primary-500)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span
        style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}
      >
        正在解析分享链接...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ShareLanding;
