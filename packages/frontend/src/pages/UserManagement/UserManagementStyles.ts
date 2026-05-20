/**
 * 用户管理页面 CSS 样式
 * 从 index.tsx / UserTable.tsx / UserModals 提取
 */

export const userManagementStyles = `
  /* ===== 容器 ===== */
  .user-management-container {
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

  /* ===== 成功 Toast ===== */
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

  /* ===== 错误横幅 ===== */
  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--error-dim);
    border: 1px solid var(--error);
    border-radius: var(--radius-xl);
    color: var(--error);
    margin-bottom: var(--space-4);
  }

  .error-retry-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    cursor: pointer;
    transition: all 0.2s;
    margin-left: auto;
  }

  .error-retry-btn:hover {
    background: #dc2626;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
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

  /* ===== 操作按钮 ===== */
  .add-user-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
    color: white;
    border: none;
    border-radius: var(--radius-xl);
    font-size: var(--text-md);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s ease;
    box-shadow: var(--shadow-md);
  }

  .add-user-btn:hover {
    background: linear-gradient(135deg, var(--primary-600), var(--primary-700));
    box-shadow: var(--shadow-lg), var(--glow-primary);
    transform: translateY(-1px);
  }

  .cleanup-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    font-size: var(--text-md);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .cleanup-btn:hover {
    border-color: var(--primary-300);
    color: var(--primary-600);
    background: var(--primary-50);
  }

  /* ===== 筛选栏 ===== */
  .filters-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    margin-bottom: var(--space-6);
  }

  .filters-grid {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-select-wrapper {
    flex: 0 0 180px;
  }

  /* ===== 用户表格容器 ===== */
  .users-table-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  /* ===== 表格 ===== */
  .table-wrapper {
    overflow-x: auto;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
  }

  .users-table thead {
    background: var(--bg-tertiary);
  }

  .users-table th {
    padding: var(--space-4) var(--space-5);
    text-align: left;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-default);
    white-space: nowrap;
  }

  .users-table td {
    padding: var(--space-4) var(--space-5);
    font-size: var(--text-md);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }

  .user-row {
    transition: background 0.15s ease;
  }

  .user-row:hover {
    background: var(--bg-tertiary);
  }

  .user-row:last-child td {
    border-bottom: none;
  }

  /* 用户信息列 */
  .cell-user {
    min-width: 200px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, var(--primary-100), var(--accent-100));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-600);
    flex-shrink: 0;
    overflow: hidden;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-details {
    min-width: 0;
  }

  .user-name {
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .user-username {
    font-size: var(--text-base);
    color: var(--text-muted);
    line-height: 1.3;
  }

  /* 邮箱/手机列 */
  .col-email,
  .col-phone,
  .cell-email,
  .cell-phone {
    white-space: nowrap;
  }

  .text-muted {
    color: var(--text-muted);
    font-style: italic;
  }

  /* 配额按钮 */
  .quota-btn {
    padding: var(--space-1) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    font-size: var(--text-base);
    cursor: pointer;
    transition: all 0.2s;
  }

  .quota-btn:hover {
    border-color: var(--primary-300);
    color: var(--primary-600);
    background: var(--primary-50);
  }

  /* 操作按钮 */
  .col-actions {
    white-space: nowrap;
  }

  .action-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .action-btn {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: transparent;
    font-size: var(--text-base);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn.edit {
    color: var(--primary-600);
    border-color: var(--primary-200);
  }

  .action-btn.edit:hover {
    background: var(--primary-50);
    border-color: var(--primary-300);
  }

  .action-btn.delete {
    color: var(--error);
    border-color: var(--error-dim);
  }

  .action-btn.delete:hover {
    background: var(--error-dim);
    border-color: var(--error);
  }

  .action-btn.restore {
    color: var(--success);
    border-color: var(--success-dim);
  }

  .action-btn.restore:hover {
    background: var(--success-dim);
    border-color: var(--success);
  }

  .pagination-bar {
    display: flex;
    justify-content: center;
    padding: var(--space-4) 0;
  }

  /* ===== 加载/空状态 ===== */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    color: var(--text-muted);
    font-size: var(--text-md);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    color: var(--text-muted);
    margin-bottom: var(--space-4);
  }

  .empty-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
  }

  /* ===== 权限不足状态 ===== */
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

  .limited-access-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-2xl);
  }

  .limited-access-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--primary-50);
    border-radius: var(--radius-full);
    color: var(--primary-500);
    margin-bottom: var(--space-6);
  }

  .limited-access-title {
    font-size: var(--text-3xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .permission-badges {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-4);
    flex-wrap: wrap;
    justify-content: center;
  }

  /* ===== 模态框共用 ===== */
  .modal-footer {
    display: flex;
    gap: var(--space-3);
  }

  .submit-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .danger-btn {
    background: var(--error) !important;
    border-color: var(--error) !important;
  }

  .danger-btn:hover {
    background: #dc2626 !important;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3) !important;
  }

  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ===== 表单样式 ===== */
  .user-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-group.has-error .form-select {
    border-color: var(--error);
    box-shadow: 0 0 0 3px var(--error-dim);
  }

  .form-label {
    font-size: var(--text-md);
    font-weight: 500;
    color: var(--text-secondary);
  }

  .form-label .required {
    color: var(--error);
  }

  .form-label .optional {
    font-weight: 400;
    color: var(--text-muted);
    font-size: var(--text-base);
  }

  .form-select {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: var(--text-md);
    transition: all 0.2s ease;
    outline: none;
  }

  .form-select:hover {
    border-color: var(--border-strong);
  }

  .form-select:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  .error-text {
    font-size: var(--text-base);
    color: var(--error);
    margin-top: 0.125rem;
  }

  /* ===== 删除确认 ===== */
  .delete-confirm-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
    color: var(--text-primary);
  }

  .delete-warning-text {
    margin: 0;
    font-size: var(--text-md);
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .delete-confirm-text {
    font-size: var(--text-md);
    color: var(--text-secondary);
    margin: 0;
  }

  .delete-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
  }

  .delete-option-checkbox {
    width: 18px;
    height: 18px;
    accent-color: var(--error);
    cursor: pointer;
  }

  .delete-option-label {
    font-size: var(--text-md);
    color: var(--text-secondary);
    cursor: pointer;
  }

  /* ===== 配额弹窗 ===== */
  .quota-config-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .quota-user-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-tertiary);
    border-radius: var(--radius-xl);
  }

  .user-avatar-sm {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, var(--primary-100), var(--accent-100));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-600);
    flex-shrink: 0;
    overflow: hidden;
  }

  .user-avatar-sm img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-info-text .user-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .user-info-text .user-username {
    font-size: var(--text-base);
    color: var(--text-muted);
  }

  .quota-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .quota-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-md);
    font-weight: 500;
    color: var(--text-secondary);
  }

  .quota-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .quota-unit {
    font-size: var(--text-md);
    font-weight: 500;
    color: var(--text-tertiary);
    min-width: 30px;
  }

  .quota-hint {
    font-size: var(--text-base);
    color: var(--text-muted);
    margin: 0;
  }

  /* ===== 清理弹窗 ===== */
  .cleanup-config-content {
    padding: var(--space-2);
  }

  .cleanup-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .cleanup-stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
  }

  .cleanup-stat-label {
    font-size: var(--text-md);
    color: var(--text-secondary);
  }

  .cleanup-stat-value {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--text-primary);
  }

  /* ===== 响应式 ===== */
  @media (max-width: 768px) {
    .user-management-container {
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

    .filter-select-wrapper {
      flex: 1;
      width: 100%;
    }

    .filters-grid {
      flex-direction: column;
    }

    .form-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .user-management-container {
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

    .users-table th,
    .users-table td {
      padding: var(--space-3);
      font-size: var(--text-base);
    }

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
  }
`;
