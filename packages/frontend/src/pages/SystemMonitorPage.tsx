import React, { useState, useEffect, useCallback } from 'react';
import { healthApi } from '../services/healthApi';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';

// Lucide 图标导入
import Activity from 'lucide-react/dist/esm/icons/activity';
import Database from 'lucide-react/dist/esm/icons/database';
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive';
import Server from 'lucide-react/dist/esm/icons/server';
import Cpu from 'lucide-react/dist/esm/icons/cpu';
import MemoryStick from 'lucide-react/dist/esm/icons/memory-stick';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import TrendingDown from 'lucide-react/dist/esm/icons/trending-down';
import Minus from 'lucide-react/dist/esm/icons/minus';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Globe from 'lucide-react/dist/esm/icons/globe';
import Zap from 'lucide-react/dist/esm/icons/zap';
import Info from 'lucide-react/dist/esm/icons/info';

// 健康状态接口
interface HealthStatus {
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

// 系统健康状态接口
interface SystemHealth {
  database: HealthStatus;
  storage: HealthStatus;
}

// 系统指标接口
interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * 系统监控页面 - CloudCAD
 * 
 * 设计特色：
 * - 专业工程美学风格
 * - 实时状态监控仪表盘
 * - 精美的动画过渡效果
 * - 完美深浅主题适配
 */
export const SystemMonitorPage: React.FC = () => {
  useDocumentTitle('系统监控');
  const { hasPermission } = usePermission();
  const { isDark } = useTheme();
  
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  
  // 模拟系统指标数据
  const [systemMetrics] = useState<SystemMetric[]>([
    { name: 'CPU 使用率', value: 32, unit: '%', status: 'good', trend: 'stable', icon: Cpu },
    { name: '内存使用', value: 4.2, unit: 'GB', status: 'good', trend: 'up', icon: MemoryStick },
    { name: '网络延迟', value: 12, unit: 'ms', status: 'good', trend: 'down', icon: Globe },
    { name: '活跃连接', value: 127, unit: '', status: 'good', trend: 'up', icon: Zap },
  ]);

  // 检查权限
  useEffect(() => {
    const canAccess = hasPermission(SystemPermission.SYSTEM_MONITOR);
    setHasAccess(canAccess);
    setPermissionChecked(true);
  }, [hasPermission]);

  // 获取系统健康状态
  const fetchSystemHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await healthApi.getHealth();
      const healthData = response.data;
      if (healthData && healthData.info) {
        const timestamp = new Date().toISOString();
        const databaseInfo = healthData.info.database;
        const storageInfo = healthData.info.storage;
        setSystemHealth({
          database: {
            status: databaseInfo?.status === 'up' ? 'up' : 'down',
            message: databaseInfo?.message || 
              (databaseInfo?.status === 'up' ? '数据库连接正常' : '数据库连接异常'),
            timestamp,
          },
          storage: {
            status: storageInfo?.status === 'up' ? 'up' : 'down',
            message: storageInfo?.message || 
              (storageInfo?.status === 'up' ? '存储服务正常' : '存储服务异常'),
            timestamp,
          },
        });
        setLastRefreshTime(new Date());
        setRefreshCountdown(30);
      } else {
        throw new Error('无效的响应数据格式');
      }
    } catch (err) {
      setError('获取系统健康状态失败');
      console.error('获取系统健康状态失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 自动刷新逻辑
  useEffect(() => {
    if (!permissionChecked || !hasAccess) return;
    
    fetchSystemHealth();
    
    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchSystemHealth();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [permissionChecked, hasAccess, fetchSystemHealth]);

  // 等待权限检查
  if (!permissionChecked) {
    return (
      <div className="monitor-page" data-theme={isDark ? 'dark' : 'light'}>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>加载中...</p>
        </div>
        <style>{baseStyles}</style>
      </div>
    );
  }

  // 无权限提示
  if (!hasAccess) {
    return (
      <div className="monitor-page" data-theme={isDark ? 'dark' : 'light'}>
        <div className="no-access-card">
          <div className="no-access-icon">
            <Shield size={48} />
          </div>
          <h2>访问受限</h2>
          <p>您需要系统监控权限才能访问此页面</p>
        </div>
        <style>{baseStyles}</style>
      </div>
    );
  }

  // 计算整体系统状态
  const overallStatus = systemHealth 
    ? (systemHealth.database.status === 'up' && systemHealth.storage.status === 'up' ? 'healthy' : 'degraded')
    : 'unknown';

  return (
    <div className="monitor-page" data-theme={isDark ? 'dark' : 'light'}>
      {/* 页面头部 */}
      <header className="page-header">
        <div className="header-left">
          <div className="title-section">
            <div className="title-icon">
              <Activity size={24} />
            </div>
            <div className="title-text">
              <h1>系统监控</h1>
              <p>实时监控系统运行状态与性能指标</p>
            </div>
          </div>
        </div>
        
        <div className="header-right">
          <div className="status-badge" data-status={overallStatus}>
            <span className="status-dot" />
            <span className="status-label">
              {overallStatus === 'healthy' ? '系统正常' : overallStatus === 'degraded' ? '系统降级' : '检测中'}
            </span>
          </div>
          
          <button 
            className="refresh-button" 
            onClick={fetchSystemHealth} 
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? '刷新中...' : '立即刷新'}</span>
          </button>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <button onClick={fetchSystemHealth}>重试</button>
        </div>
      )}

      {/* 主内容区 */}
      <main className="main-content">
        {/* 核心服务状态 */}
        <section className="section">
          <div className="section-header">
            <h2>核心服务</h2>
            <span className="section-badge">
              <Clock size={14} />
              {lastRefreshTime.toLocaleTimeString('zh-CN')}
            </span>
          </div>
          
          <div className="service-grid">
            {/* 数据库卡片 */}
            <ServiceCard
              title="PostgreSQL 数据库"
              description="主数据库连接状态"
              icon={Database}
              status={systemHealth?.database.status || 'down'}
              message={systemHealth?.database.message || '检测中...'}
              timestamp={systemHealth?.database.timestamp}
              loading={loading && !systemHealth}
              isDark={isDark}
            />
            
            {/* 存储服务卡片 */}
            <ServiceCard
              title="文件存储"
              description="本地文件系统"
              icon={HardDrive}
              status={systemHealth?.storage.status || 'down'}
              message={systemHealth?.storage.message || '检测中...'}
              timestamp={systemHealth?.storage.timestamp}
              loading={loading && !systemHealth}
              isDark={isDark}
            />
            
            {/* 应用服务卡片 */}
            <ServiceCard
              title="应用服务"
              description="NestJS 后端服务"
              icon={Server}
              status="up"
              message="服务运行正常"
              timestamp={new Date().toISOString()}
              loading={false}
              isDark={isDark}
            />
          </div>
        </section>

        {/* 性能指标 */}
        <section className="section">
          <div className="section-header">
            <h2>性能指标</h2>
            <span className="auto-refresh-hint">
              自动刷新: {refreshCountdown}s
            </span>
          </div>
          
          <div className="metrics-grid">
            {systemMetrics.map((metric, index) => (
              <MetricCard
                key={metric.name}
                metric={metric}
                delay={index * 0.1}
                isDark={isDark}
              />
            ))}
          </div>
        </section>

        {/* 系统信息 */}
        <section className="section">
          <div className="section-header">
            <h2>系统信息</h2>
          </div>
          
          <div className="info-grid">
            <div className="info-card">
              <Info size={18} />
              <div className="info-content">
                <span className="info-label">系统名称</span>
                <span className="info-value">CloudCAD Cloud Platform</span>
              </div>
            </div>
            
            <div className="info-card">
              <Server size={18} />
              <div className="info-content">
                <span className="info-label">运行环境</span>
                <span className="info-value">
                  {import.meta.env.MODE === 'production' ? '生产环境' : '开发环境'}
                </span>
              </div>
            </div>
            
            <div className="info-card">
              <Clock size={18} />
              <div className="info-content">
                <span className="info-label">刷新间隔</span>
                <span className="info-value">30 秒自动刷新</span>
              </div>
            </div>
            
            <div className="info-card">
              <Activity size={18} />
              <div className="info-content">
                <span className="info-label">版本</span>
                <span className="info-value">v1.0.0</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <style>{baseStyles}</style>
      <style>{componentStyles}</style>
    </div>
  );
};

// 服务卡片组件
interface ServiceCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  status: 'up' | 'down';
  message: string;
  timestamp?: string;
  loading?: boolean;
  isDark: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  icon: Icon,
  status,
  message,
  timestamp,
  loading,
  isDark,
}) => {
  const isUp = status === 'up';
  
  return (
    <div className={`service-card ${loading ? 'loading' : ''}`} data-status={status}>
      <div className="service-header">
        <div className={`service-icon ${isUp ? 'healthy' : 'unhealthy'}`}>
          <Icon size={22} />
        </div>
        <div className="service-title-area">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className={`service-status-badge ${isUp ? 'up' : 'down'}`}>
          {isUp ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span>{isUp ? '正常' : '异常'}</span>
        </div>
      </div>
      
      <div className="service-details">
        <div className="detail-row">
          <span className="detail-label">状态消息</span>
          <span className="detail-value">{message}</span>
        </div>
        {timestamp && (
          <div className="detail-row">
            <span className="detail-label">检测时间</span>
            <span className="detail-value">
              {new Date(timestamp).toLocaleString('zh-CN')}
            </span>
          </div>
        )}
      </div>
      
      {/* 背景装饰 */}
      <div className="card-bg-pattern" />
    </div>
  );
};

// 指标卡片组件
interface MetricCardProps {
  metric: SystemMetric;
  delay: number;
  isDark: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ metric, delay, isDark }) => {
  const { name, value, unit, status, trend, icon: Icon } = metric;
  
  const statusColors = {
    good: 'var(--success)',
    warning: 'var(--warning)',
    critical: 'var(--error)',
  };
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  
  return (
    <div 
      className="metric-card"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="metric-icon-wrapper">
        <Icon size={20} />
      </div>
      
      <div className="metric-content">
        <span className="metric-name">{name}</span>
        <div className="metric-value-row">
          <span 
            className="metric-value"
            style={{ color: statusColors[status] }}
          >
            {value}
          </span>
          <span className="metric-unit">{unit}</span>
        </div>
      </div>
      
      <div className={`metric-trend ${trend}`}>
        <TrendIcon size={14} />
      </div>
    </div>
  );
};

// 基础样式
const baseStyles = `
  .monitor-page {
    min-height: 100%;
    padding: 2rem;
    background: var(--bg-primary);
    font-family: var(--font-family-base);
  }

  /* 加载状态 */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
    color: var(--text-tertiary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--primary-500);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 无权限卡片 */
  .no-access-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
    padding: 2rem;
  }

  .no-access-icon {
    width: 96px;
    height: 96px;
    background: linear-gradient(135deg, var(--error), #dc2626);
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    margin-bottom: 1.5rem;
    box-shadow: 0 20px 40px -10px rgba(239, 68, 68, 0.4);
  }

  .no-access-card h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .no-access-card p {
    color: var(--text-tertiary);
    font-size: 0.9375rem;
  }

  /* 页面头部 */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .title-icon {
    width: 52px;
    height: 52px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 8px 24px -4px rgba(99, 102, 241, 0.4);
  }

  .title-text h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .title-text p {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin: 0.25rem 0 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* 状态徽章 */
  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: 100px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status-badge[data-status="healthy"] .status-dot {
    background: var(--success);
    box-shadow: 0 0 8px var(--success);
  }

  .status-badge[data-status="degraded"] .status-dot {
    background: var(--warning);
    box-shadow: 0 0 8px var(--warning);
  }

  .status-badge[data-status="unknown"] .status-dot {
    background: var(--text-muted);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-label {
    color: var(--text-secondary);
  }

  /* 刷新按钮 */
  .refresh-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background: linear-gradient(135deg, var(--primary-600), var(--primary-500));
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.3);
  }

  .refresh-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px -2px rgba(99, 102, 241, 0.4);
  }

  .refresh-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  /* 错误横幅 */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    background: var(--error-dim);
    border: 1px solid var(--error);
    border-radius: 12px;
    color: var(--error);
    margin-bottom: 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .error-banner button {
    margin-left: auto;
    padding: 0.375rem 0.75rem;
    background: var(--error);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .error-banner button:hover {
    opacity: 0.9;
  }

  /* 主内容区 */
  .main-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* 区块样式 */
  .section {
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .section-header h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
  }

  .auto-refresh-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
  }

  /* 服务网格 */
  .service-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.25rem;
  }

  /* 指标网格 */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  /* 信息网格 */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }

  .info-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    transition: all 0.2s;
  }

  .info-card:hover {
    border-color: var(--border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .info-card svg {
    color: var(--primary-500);
    flex-shrink: 0;
  }

  .info-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .monitor-page {
      padding: 1rem;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-right {
      width: 100%;
      justify-content: space-between;
    }

    .service-grid {
      grid-template-columns: 1fr;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .info-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }

  /* 深色主题增强 */
  [data-theme="dark"] .title-icon {
    box-shadow: 0 8px 24px -4px rgba(34, 211, 238, 0.3);
  }

  [data-theme="dark"] .refresh-button {
    box-shadow: 0 4px 12px -2px rgba(34, 211, 238, 0.2);
  }

  [data-theme="dark"] .refresh-button:hover:not(:disabled) {
    box-shadow: 0 6px 16px -2px rgba(34, 211, 238, 0.3);
  }
`;

// 组件样式
const componentStyles = `
  /* 服务卡片 */
  .service-card {
    position: relative;
    padding: 1.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s;
  }

  .service-card:hover {
    border-color: var(--border-strong);
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
  }

  .service-card[data-status="up"] {
    border-left: 3px solid var(--success);
  }

  .service-card[data-status="down"] {
    border-left: 3px solid var(--error);
  }

  .service-card.loading {
    opacity: 0.7;
  }

  .service-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .service-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .service-icon.healthy {
    background: var(--success-dim);
    color: var(--success);
  }

  .service-icon.unhealthy {
    background: var(--error-dim);
    color: var(--error);
  }

  .service-title-area {
    flex: 1;
    min-width: 0;
  }

  .service-title-area h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.25rem;
  }

  .service-title-area p {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    margin: 0;
  }

  .service-status-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .service-status-badge.up {
    background: var(--success-dim);
    color: var(--success);
  }

  .service-status-badge.down {
    background: var(--error-dim);
    color: var(--error);
  }

  .service-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .detail-label {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .detail-value {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-align: right;
  }

  .card-bg-pattern {
    position: absolute;
    right: -20px;
    top: -20px;
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    opacity: 0.03;
    border-radius: 50%;
    pointer-events: none;
  }

  /* 指标卡片 */
  .metric-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    transition: all 0.3s;
    animation: slideIn 0.5s ease-out backwards;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .metric-card:hover {
    border-color: var(--border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .metric-icon-wrapper {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }

  .metric-content {
    flex: 1;
    min-width: 0;
  }

  .metric-name {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: block;
    margin-bottom: 0.25rem;
  }

  .metric-value-row {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .metric-unit {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .metric-trend {
    padding: 0.375rem;
    border-radius: 6px;
  }

  .metric-trend.up {
    background: var(--success-dim);
    color: var(--success);
  }

  .metric-trend.down {
    background: var(--info-dim);
    color: var(--info);
  }

  .metric-trend.stable {
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  /* 深色主题服务卡片增强 */
  [data-theme="dark"] .service-card {
    background: rgba(26, 29, 33, 0.8);
    backdrop-filter: blur(10px);
  }

  [data-theme="dark"] .service-card:hover {
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
  }

  [data-theme="dark"] .metric-card {
    background: rgba(26, 29, 33, 0.6);
  }

  [data-theme="dark"] .metric-icon-wrapper {
    box-shadow: 0 4px 12px -2px rgba(34, 211, 238, 0.3);
  }
`;

export default SystemMonitorPage;