///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

export const runtimeConfigStyles = `
  /* ===== 基础布局 ===== */
  .config-page {
    min-height: 100%;
    padding: var(--space-6);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-family-base);
  }

  /* ===== 页面头部 ===== */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-6);
    border-bottom: 1px solid var(--border-default);
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .title-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: var(--shadow-md), var(--glow-primary);
  }

  .title-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  /* ===== 统计栏 ===== */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
  }

  .stat-value.public {
    color: var(--success);
  }

  .stat-value.modified {
    color: var(--warning);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-divider {
    width: 1px;
    height: 32px;
    background: var(--border-default);
  }

  /* ===== 提示横幅 ===== */
  .info-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--info-dim);
    border: 1px solid var(--info);
    border-radius: var(--radius-lg);
    color: var(--info);
    margin-bottom: var(--space-6);
    animation: slide-up 0.3s ease-out;
  }

  /* ===== 配置网格 ===== */
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
    gap: var(--space-5);
  }

  @media (max-width: 640px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ===== 配置卡片 ===== */
  .config-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: all 0.3s ease;
    animation: card-enter 0.4s ease-out forwards;
    opacity: 0;
    transform: translateY(10px);
  }

  @keyframes card-enter {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .config-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg);
  }

  /* ===== 卡片头部 ===== */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5);
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-default);
  }

  .card-title-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .card-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: var(--shadow-sm);
  }

  .card-title-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-count {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .modified-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--warning-dim);
    color: var(--warning);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 500;
    animation: pulse-soft 2s ease-in-out infinite;
  }

  /* ===== 卡片内容 ===== */
  .card-content {
    display: block;
  }

  .config-list {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ===== 配置项 ===== */
  .config-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
    animation: item-enter 0.3s ease-out forwards;
    opacity: 0;
    transform: translateX(-10px);
  }

  @keyframes item-enter {
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .config-item:hover {
    border-color: var(--border-default);
    box-shadow: var(--shadow-sm);
  }

  .config-item.modified {
    border-color: var(--warning);
    background: linear-gradient(135deg, var(--bg-primary), var(--warning-dim));
  }

  .config-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .config-key-wrapper {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .config-key {
    font-family: var(--font-family-mono);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .config-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .public-badge {
    background: var(--success-dim);
    color: var(--success);
  }

  .config-description {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    line-height: 1.5;
    margin: 0;
  }

  .config-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .input-wrapper {
    min-width: 200px;
  }

  /* ===== 输入控件 ===== */
  .config-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: var(--font-family-mono);
    transition: all 0.2s ease;
  }

  .config-input:hover:not(:disabled) {
    border-color: var(--border-strong);
  }

  .config-input:focus:not(:disabled) {
    outline: none;
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  .config-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--bg-tertiary);
  }

  .number-input {
    width: 120px;
    text-align: right;
  }

  .number-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .number-input-wrapper .number-input {
    width: 100px;
  }

  .number-input-wrapper .number-input.has-unit {
    width: 80px;
  }

  .input-unit {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    white-space: nowrap;
  }

  .sensitive-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .sensitive-input {
    padding-right: 40px;
  }

  .visibility-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .visibility-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  /* ===== 开关控件 ===== */
  .toggle-switch {
    width: 52px;
    height: 28px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    position: relative;
    cursor: pointer;
    border: none;
    padding: 0;
    transition: all 0.2s ease;
  }

  .toggle-switch:hover:not(:disabled) {
    background: var(--border-strong);
  }

  .toggle-switch.active {
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  }

  [data-theme="dark"] .toggle-switch.active {
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
  }

  .toggle-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-handle {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-sm);
  }

  .toggle-switch.active .toggle-handle {
    transform: translateX(24px);
  }

  /* ===== 操作按钮 ===== */
  .action-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-color: var(--border-strong);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .save-btn.active {
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    color: white;
    border-color: transparent;
  }

  .save-btn.active:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md), var(--glow-primary);
  }

  .reset-btn:hover:not(:disabled) {
    color: var(--error);
    border-color: var(--error);
    background: var(--error-dim);
  }

  /* ===== 加载状态 ===== */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: var(--space-4);
    color: var(--text-tertiary);
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-default);
    border-top-color: var(--primary-500);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  /* ===== 空状态 ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    background: var(--bg-tertiary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-4);
    color: var(--text-muted);
  }

  .empty-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  /* ===== 动画 ===== */
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* ===== 深色主题特殊调整 ===== */
  [data-theme="dark"] .config-input:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  [data-theme="dark"] .config-item.modified {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), var(--bg-primary));
  }

  [data-theme="dark"] .card-icon {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  }

  [data-theme="dark"] .title-icon {
    box-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
  }

  /* ===== 响应式调整 ===== */
  @media (max-width: 768px) {
    .config-page {
      padding: var(--space-4);
    }

    .page-header {
      flex-direction: column;
      gap: var(--space-4);
    }

    .header-right {
      width: 100%;
      justify-content: flex-start;
    }

    .config-item {
      flex-direction: column;
      gap: var(--space-3);
    }

    .config-controls {
      width: 100%;
    }

    .input-wrapper {
      flex: 1;
      min-width: 0;
    }
  }
`;
