///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 角色管理页面 CSS 样式
 * 从 RoleManagement.tsx 提取，减少主文件行数
 */

export const roleManagementStyles = `
  /* ===== 容器基础 ===== */
  .role-management-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--space-6);
    animation: fadeIn 0.4s ease-out;
    min-height: 100vh;
    background: transparent;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== 成功提示 Toast ===== */
  .success-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--success);
    color: white;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    animation: slideInRight 0.3s ease-out;
    z-index: 100; /* local stacking */
  }

  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* ===== 页面头部 ===== */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-6);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-sm);
  }

  .page-title-section {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .page-title-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-xl);
    color: white;
    box-shadow: var(--shadow-md), 0 0 20px rgba(99, 102, 241, 0.3);
    transition: all 0.3s ease;
  }

  .page-title-icon:hover {
    transform: scale(1.05) rotate(5deg);
    box-shadow: var(--shadow-lg), 0 0 30px rgba(99, 102, 241, 0.4);
  }

  .page-title {
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--text-primary), var(--primary-500));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .page-subtitle {
    font-size: var(--text-md);
    color: var(--text-tertiary);
    margin: 0.375rem 0 0;
  }

  /* ===== 角色模块 ===== */
  .roles-section {
    margin-bottom: var(--space-8);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }

  .section-title {
    font-size: var(--text-2xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-subtitle {
    font-size: var(--text-md);
    color: var(--text-tertiary);
    margin: 0.25rem 0 0;
  }

  /* ===== 角色卡片网格 ===== */
  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-5);
  }

  @media (max-width: 1200px) {
    .roles-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .roles-grid {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }
  }

  /* ===== 角色卡片 ===== */
  .role-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    animation: cardFadeIn 0.5s ease-out backwards;
    position: relative;
  }

  @keyframes cardFadeIn {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .role-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-500), var(--accent-500));
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .role-card:hover {
    border-color: var(--primary-300);
    box-shadow: var(--shadow-xl), 0 0 40px rgba(99, 102, 241, 0.1);
    transform: translateY(-4px);
  }

  .role-card:hover::before {
    opacity: 1;
  }

  .role-card.system-role::before {
    background: linear-gradient(90deg, var(--accent-500), var(--accent-400));
  }

  .role-card.custom-role {
    border: 1px solid var(--success);
    background: linear-gradient(
      135deg,
      var(--bg-secondary) 0%,
      rgba(34, 197, 94, 0.03) 50%,
      var(--bg-secondary) 100%
    );
  }

  [data-theme="dark"] .role-card.custom-role {
    background: linear-gradient(
      135deg,
      var(--bg-secondary) 0%,
      rgba(34, 197, 94, 0.08) 50%,
      var(--bg-secondary) 100%
    );
  }

  .role-card.custom-role::before {
    background: linear-gradient(90deg, var(--success), #4ade80);
  }

  /* 卡片头部 */
  .role-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
  }

  .role-info {
    flex: 1;
    min-width: 0;
  }

  .role-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .role-description {
    font-size: var(--text-md);
    color: var(--text-tertiary);
    margin: var(--space-2) 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-members {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: var(--space-2) 0 0;
  }

  .delete-btn {
    padding: var(--space-2);
    background: transparent;
    border: none;
    color: var(--text-muted);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: var(--error-dim);
    color: var(--error);
  }

  /* 权限区域 */
  .role-permissions {
    padding: var(--space-5);
    background: var(--bg-tertiary);
    flex: 1;
  }

  .permissions-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 var(--space-3);
  }

  .permissions-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .permission-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .permission-tag:hover {
    background: var(--primary-100);
    border-color: var(--primary-300);
    color: var(--primary-600);
    transform: translateY(-1px);
  }

  [data-theme="dark"] .permission-tag:hover {
    background: rgba(99, 102, 241, 0.15);
    border-color: var(--primary-500);
    color: var(--primary-400);
  }

  .more-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    background: var(--bg-elevated);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  /* 卡片底部 */
  .role-card-footer {
    padding: var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }

  /* ===== 无权限状态 ===== */
  .access-denied-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
  }

  .access-denied-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--warning-dim);
    border-radius: var(--radius-full);
    color: var(--warning);
    margin-bottom: var(--space-6);
  }

  .access-denied-title {
    font-size: var(--text-3xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .access-denied-text {
    font-size: var(--text-lg);
    color: var(--text-secondary);
    margin: var(--space-3) 0 0;
  }

  .access-denied-hint {
    font-size: var(--text-md);
    color: var(--text-tertiary);
    margin: var(--space-2) 0 0;
  }

  /* ===== 模态框相关 ===== */
  .modal-footer {
    display: flex;
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    .modal-footer {
      flex-direction: column-reverse;
      width: 100%;
    }

    .modal-footer button {
      width: 100%;
    }

    .delete-warning-box {
      padding: var(--space-3);
    }

    .error-modal-content {
      padding: var(--space-1);
    }
  }

  .danger-btn {
    background: var(--error) !important;
    border-color: var(--error) !important;
  }

  .danger-btn:hover {
    background: #dc2626 !important;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3) !important;
  }

  .delete-confirm-content {
    padding: var(--space-2);
  }

  .delete-warning-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--warning-dim);
    border: 1px solid var(--warning);
    border-radius: var(--radius-xl);
    color: var(--warning);
  }

  .delete-warning-title {
    font-weight: 600;
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
  }

  .delete-warning-text {
    margin: 0;
    font-size: var(--text-md);
    opacity: 0.9;
  }

  .error-modal-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2);
  }

  .error-icon {
    color: var(--warning);
    flex-shrink: 0;
  }

  /* ===== 动画类 ===== */
  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ===== 响应式调整 ===== */
  @media (max-width: 768px) {
    .role-management-container {
      padding: var(--space-4);
    }

    .page-header {
      flex-direction: column;
      align-items: stretch;
      padding: var(--space-4);
    }

    .page-title {
      font-size: var(--text-3xl);
    }

    .page-title-icon {
      width: 48px;
      height: 48px;
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
    }
  }

  @media (max-width: 640px) {
    .role-management-container {
      padding: var(--space-3);
    }

    .page-header {
      padding: var(--space-3);
      gap: var(--space-3);
    }

    .page-title-section {
      margin-bottom: var(--space-2);
    }

    .page-title {
      font-size: var(--text-2xl);
    }

    .page-subtitle {
      font-size: var(--text-md);
    }

    .role-card-header {
      padding: var(--space-4);
    }

    .role-permissions {
      padding: var(--space-4);
    }

    .permission-tag {
      font-size: var(--text-xs);
      padding: 0.25rem 0.5rem;
    }
  }

  /* 小屏手机适配 */
  @media (max-width: 375px) {
    .page-title {
      font-size: var(--text-xl);
    }

    .role-name {
      font-size: var(--text-lg);
    }

    .section-title {
      font-size: var(--text-xl);
    }
  }
`;
