///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * Login page styles extracted from the monolithic Login.tsx inline <style> tag.
 * All CSS class names preserved exactly to maintain backward compatibility.
 */

export const loginStyles = `
/* ===== 基础布局 ===== */
.login-page {
  min-height: 100vh;
  display: flex;
  position: relative;
  overflow: hidden;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: transparent;
}

/* ===== 主题切换按钮 ===== */
.theme-toggle-wrapper {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 100;
}

/* ===== 主容器 - 居中布局 ===== */
.login-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

/* ===== 登录卡片 ===== */
.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 24px;
  padding: 2.5rem;
  box-shadow:
    0 25px 60px -15px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  animation: card-appear 0.6s ease-out;
}

@keyframes card-appear {
  from { opacity: 0; transform: translateY(30px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== Logo 区域 ===== */
.logo-section {
  text-align: center;
  margin-bottom: 1.5rem;
}

.logo-wrapper {
  position: relative;
  width: 72px;
  height: 72px;
  margin: 0 auto 1rem;
}

.logo-glow {
  position: absolute;
  inset: -8px;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  border-radius: 50%;
  opacity: 0.3;
  filter: blur(20px);
  animation: logo-glow-pulse 3s ease-in-out infinite;
}

@keyframes logo-glow-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
}

.logo-image {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 16px;
  z-index: 1;
  animation: logo-float 3s ease-in-out infinite;
}

@keyframes logo-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.app-title {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.375rem;
  letter-spacing: -0.02em;
}

.app-tagline {
  font-size: 0.875rem;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* ===== 表单头部 ===== */
.form-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.form-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.form-subtitle {
  font-size: 0.875rem;
  color: var(--text-tertiary);
}

/* ===== Tab 切换 ===== */
.login-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.25rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.login-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: var(--text-tertiary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.login-tab:hover {
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.login-tab.active {
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.login-tab svg {
  flex-shrink: 0;
}

/* ===== 消息提示 ===== */
.alert {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: 10px;
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
  animation: slide-up 0.3s ease-out;
}

.alert-success {
  background: var(--success-dim);
  border: 1px solid var(--success);
  color: var(--success);
}

.alert-error {
  background: var(--error-dim);
  border: 1px solid var(--error);
  color: var(--error);
}

.alert-icon { flex-shrink: 0; }

@keyframes slide-up {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 表单样式 ===== */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.input-group.focused .input-label {
  color: var(--primary-500);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 1rem;
  color: var(--text-muted);
  transition: all 0.2s;
  z-index: 2;
}

.input-icon.active {
  color: var(--primary-500);
  transform: scale(1.1);
}

.input-field {
  width: 100%;
  padding: 0.875rem 1rem 0.875rem 2.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 0.9375rem;
  transition: all 0.2s;
  outline: none;
}

.input-field::placeholder { color: var(--text-muted); }
.input-field:hover { border-color: var(--border-strong); }
.input-field:focus {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.input-field.has-toggle {
  padding-right: 2.75rem;
}

.input-glow {
  position: absolute;
  inset: -2px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  opacity: 0;
  z-index: -1;
  transition: opacity 0.3s;
  filter: blur(8px);
}

.input-group.focused .input-glow { opacity: 0.3; }

/* ===== 密码显示/隐藏按钮 ===== */
.password-toggle {
  position: absolute;
  right: 1rem;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  z-index: 2;
}

.password-toggle:hover {
  color: var(--text-secondary);
}

/* ===== 验证码按钮 ===== */
.input-wrapper.has-button {
  position: relative;
}

.input-field.has-button {
  padding-right: 7rem;
}

.code-button {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  z-index: 2;
  min-width: 5.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.code-button:hover:not(:disabled) {
  transform: translateY(-50%) scale(1.02);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.code-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

/* ===== 表单选项 ===== */
.form-options {
  display: flex;
  justify-content: flex-end;
  margin-top: -0.5rem;
}

.forgot-password-link {
  font-size: 0.8125rem;
  color: var(--primary-500);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
  font-weight: 500;
}

.forgot-password-link:hover {
  color: var(--primary-600);
  text-decoration: underline;
}

/* ===== 提交按钮 ===== */
.submit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
}

.submit-button:active:not(:disabled) { transform: translateY(0); }
.submit-button:disabled { opacity: 0.7; cursor: not-allowed; }

.button-arrow { transition: transform 0.2s; }
.submit-button:hover:not(:disabled) .button-arrow { transform: translateX(4px); }

/* ===== 表单底部 ===== */
.form-footer {
  margin-top: 1.5rem;
  text-align: center;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-subtle);
}

.register-text {
  font-size: 0.875rem;
  color: var(--text-tertiary);
}

.register-link {
  color: var(--primary-500);
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 600;
  margin-left: 0.25rem;
  transition: all 0.2s;
}

.register-link:hover {
  color: var(--primary-600);
  text-decoration: underline;
}

/* ===== 特性图标栏 ===== */
.features-bar {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-subtle);
}

.feature-dot {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: all 0.2s;
  cursor: pointer;
}

.feature-dot:hover {
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  border-color: transparent;
  color: white;
  transform: translateY(-2px);
}

/* Tooltip 样式 */
.feature-dot::before {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.9);
  padding: 0.375rem 0.625rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-md);
  z-index: 10;
}

/* Tooltip 箭头 */
.feature-dot::after {
  content: '';
  position: absolute;
  bottom: calc(100% + 3px);
  left: 50%;
  transform: translateX(-50%) scale(0.9);
  border: 4px solid transparent;
  border-top-color: var(--border-default);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 10;
}

.feature-dot:hover::before,
.feature-dot:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
}

/* ===== 微信登录按钮 ===== */
.divider {
  display: flex;
  align-items: center;
  margin: 1.5rem 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.divider span {
  padding: 0 0.75rem;
}

.wechat-login-button {
  width: 100%;
  height: 44px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.wechat-login-button:hover {
  background: #07c160;
  border-color: #07c160;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3);
}

.wechat-login-button:active {
  transform: translateY(0);
}

/* ===== 版权信息 ===== */
.copyright {
  margin-top: 2rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* ===== 响应式设计 ===== */
@media (max-width: 480px) {
  .login-container { padding: 1rem; }
  .login-card { padding: 1.75rem; border-radius: 20px; }
  .logo-wrapper { width: 64px; height: 64px; }
  .app-title { font-size: 1.375rem; }
  .theme-toggle-wrapper { top: 1rem; right: 1rem; }
}

/* ===== 隐藏浏览器自带的密码显示按钮 ===== */
input[type="password"]::-ms-reveal,
input[type="password"]::-ms-clear {
  display: none;
}

input[type="password"]::-webkit-credentials-auto-fill-button {
  visibility: hidden;
  display: none !important;
  pointer-events: none;
  position: absolute;
  right: 0;
}

/* 针对 Edge 浏览器的密码显示按钮 */
input[type="password"]::-webkit-textfield-decoration-container {
  display: none;
}

/* ===== 联系客服弹框 ===== */
.support-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade-in 0.3s ease-out;
}

.support-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slide-up 0.3s ease-out;
}

.support-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-subtle);
}

.support-modal-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.support-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.support-modal-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.support-modal-content {
  padding: 1.5rem;
}

.support-modal-message {
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.support-contact-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.support-contact-item {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
}

.support-contact-label {
  color: var(--text-tertiary);
  min-width: 80px;
}

.support-contact-link {
  color: var(--primary-500);
  text-decoration: none;
  transition: color 0.2s;
}

.support-contact-link:hover {
  color: var(--primary-600);
  text-decoration: underline;
}

.support-contact-value {
  color: var(--text-secondary);
}

.support-modal-footer {
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
}

.support-modal-button {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.support-modal-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ===== 深色主题特殊处理 ===== */
[data-theme="dark"] .login-card {
  background: rgba(26, 29, 33, 0.9);
  backdrop-filter: blur(20px);
  box-shadow:
    0 25px 60px -15px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

[data-theme="dark"] .input-field {
  background: var(--bg-primary);
}

[data-theme="dark"] .logo-glow {
  opacity: 0.4;
}

[data-theme="dark"] .support-modal {
  background: rgba(26, 29, 33, 0.95);
  backdrop-filter: blur(20px);
}
`;
