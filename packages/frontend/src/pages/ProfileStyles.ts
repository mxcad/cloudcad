/**
 * Profile 页面 CSS 样式
 * 从 Profile.tsx 提取，减少主文件行数
 */

export const profileStyles = `
        .profile-page { min-height: 100vh; position: relative; overflow: hidden; font-family: var(--font-family-base); background: transparent; padding: 2rem; }
        .back-button { position: fixed; top: 1.5rem; left: 1.5rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-lg); color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; z-index: 10; backdrop-filter: blur(10px); }
        .back-button:hover { background: var(--bg-tertiary); border-color: var(--border-strong); transform: translateX(-2px); }
        .profile-container { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; padding-top: 3rem; }
        .profile-card { background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 24px; overflow: hidden; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; animation: card-appear 0.6s ease-out; }
        @keyframes card-appear { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .profile-header { padding: 2.5rem 2rem 1.5rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%); border-bottom: 1px solid var(--border-default); }
        .avatar-section { display: flex; align-items: center; gap: 1.5rem; }
        .avatar-wrapper { position: relative; width: 80px; height: 80px; }
        .avatar-glow { position: absolute; inset: -4px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-radius: 50%; opacity: 0.3; filter: blur(15px); animation: avatar-pulse 3s ease-in-out infinite; }
        @keyframes avatar-pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
        .avatar-image, .avatar-placeholder { position: relative; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; z-index: 1; border: 3px solid var(--bg-secondary); }
        .avatar-placeholder { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); display: flex; align-items: center; justify-content: center; color: white; }
        .avatar-badge { position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; background: linear-gradient(135deg, #f59e0b, #fbbf24); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; z-index: 2; border: 2px solid var(--bg-secondary); }
        .user-info { flex: 1; }
        .user-name { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.375rem; }
        .user-role { display: flex; align-items: center; gap: 0.375rem; font-size: 0.875rem; color: var(--text-tertiary); }
        .tabs-container { position: relative; display: flex; padding: 0.5rem; background: var(--bg-tertiary); margin: 1.5rem 2rem 0; border-radius: var(--radius-xl); }
        .tab-button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: transparent; border: none; border-radius: var(--radius-lg); color: var(--text-tertiary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease; position: relative; z-index: 1; }
        .tab-button:hover { color: var(--text-secondary); }
        .tab-button.active { color: var(--text-primary); }
        .tab-indicator { position: absolute; top: 0.5rem; left: 0; height: calc(100% - 1rem); background: var(--bg-secondary); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 0; }
        .alert { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; border-radius: 12px; margin: 1.5rem 2rem 0; font-size: 0.875rem; animation: slide-up 0.3s ease-out; }
        .alert-success { background: var(--success-dim); border: 1px solid var(--success); color: var(--success); }
        .alert-error { background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
        .alert-icon { flex-shrink: 0; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .content-area { padding: 1.5rem 2rem 2rem; }
        .tab-content { animation: fade-in 0.3s ease-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
        .info-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 16px; transition: all 0.3s ease; }
        .info-card:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .info-icon-wrapper { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .info-icon-wrapper.primary { background: linear-gradient(135deg, var(--primary-500), var(--primary-600)); color: white; }
        .info-icon-wrapper.accent { background: linear-gradient(135deg, var(--accent-500), var(--accent-600)); color: white; }
        .info-icon-wrapper.success { background: linear-gradient(135deg, var(--success), #16a34a); color: white; }
        .info-icon-wrapper.warning { background: linear-gradient(135deg, var(--warning), #d97706); color: white; }
        .info-icon-wrapper.info { background: linear-gradient(135deg, var(--info), #2563eb); color: white; }
        .info-icon-wrapper.purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
        .info-content { flex: 1; min-width: 0; }
        .info-content label { display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .info-content span { display: block; font-size: 0.9375rem; color: var(--text-primary); font-weight: 500; }
        .role-badge, .status-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .role-badge { background: linear-gradient(135deg, var(--primary-100), var(--primary-200)); color: var(--primary-700); }
        .status-badge.active { background: var(--success-dim); color: var(--success); }
        .status-badge.inactive { background: var(--warning-dim); color: var(--warning); }
        .status-badge.disabled { background: var(--error-dim); color: var(--error); }
        .password-form, .email-form { max-width: 400px; margin: 0 auto; }
        .input-group { margin-bottom: 1.25rem; }
        .input-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 0.5rem; transition: color 0.2s; }
        .input-group.focused .input-label { color: var(--primary-500); }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-wrapper.has-button { padding-right: 0; }
        .code-button { position: absolute; right: 0.5rem; padding: 0.5rem 0.875rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 8px; color: var(--primary-500); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .code-button:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--primary-500); }
        .code-button:disabled { opacity: 0.6; cursor: not-allowed; color: var(--text-muted); }
        .verify-notice, .verify-success { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; border-radius: 12px; font-size: 0.875rem; }
        .verify-notice { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: var(--warning-500); }
        .verify-success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: var(--success-500); }
        .notice-text { font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: var(--bg-tertiary); border-radius: 8px; }
        .button-group { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
        .back-button-form { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.875rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .back-button-form:hover { background: var(--bg-tertiary); border-color: var(--border-strong); }
        .email-preview { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; background: var(--bg-tertiary); border-radius: 12px; font-size: 0.9375rem; color: var(--text-primary); font-weight: 500; }
        .info-text { margin-bottom: 1.25rem; padding: 0.75rem 1rem; background: var(--bg-tertiary); border-radius: 12px; font-size: 0.875rem; color: var(--text-secondary); text-align: center; }
        .input-wrapper input { width: 100%; padding: 0.875rem 1rem; padding-right: 2.75rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 0.9375rem; transition: all 0.2s; outline: none; }
        .input-wrapper input::placeholder { color: var(--text-muted); }
        .input-wrapper input:hover { border-color: var(--border-strong); }
        .input-wrapper input:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .input-glow { position: absolute; inset: -2px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); opacity: 0; z-index: -1; transition: opacity 0.3s; filter: blur(8px); }
        .input-group.focused .input-glow { opacity: 0.25; }
        .toggle-password { position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; transition: color 0.2s; }
        .toggle-password:hover { color: var(--text-secondary); }
        .password-strength { margin-top: 0.5rem; display: flex; align-items: center; gap: 0.75rem; }
        .strength-bar { flex: 1; height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden; }
        .strength-fill { height: 100%; border-radius: 2px; transition: all 0.3s ease; }
        .strength-label { font-size: 0.75rem; font-weight: 500; }
        .submit-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, var(--primary-600), var(--accent-600)); border: none; border-radius: 12px; color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); margin-top: 0.5rem; }
        .submit-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
        .submit-button:active:not(:disabled) { transform: translateY(0); }
        .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }
        .animate-spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .field-hint { margin-top: 0.5rem; text-align: right; }
        .forgot-password-link { background: none; border: none; color: var(--primary-500); font-size: 0.8125rem; cursor: pointer; padding: 0; transition: color 0.2s; }
        .forgot-password-link:hover { color: var(--primary-600); text-decoration: underline; }
        .no-password-hint { display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem; background: linear-gradient(135deg, var(--primary-50) 0%, var(--primary-100) 100%); border: 1px solid var(--primary-200); border-radius: 12px; margin-bottom: 1.5rem; }
        [data-theme='dark'] .no-password-hint { background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.15) 100%); border-color: rgba(59, 130, 246, 0.3); }
        .no-password-hint .hint-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--primary-500); border-radius: 12px; color: white; flex-shrink: 0; }
        .no-password-hint .hint-content h4 { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 0.5rem 0; }
        .no-password-hint .hint-content p { font-size: 0.875rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        .security-tips { margin-top: 1.5rem; padding: 1.25rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; }
        .security-tips h4 { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.75rem; }
        .security-tips ul { list-style: none; padding: 0; margin: 0; }
        .security-tips li { position: relative; padding-left: 1rem; font-size: 0.8125rem; color: var(--text-tertiary); margin-bottom: 0.375rem; }
        .security-tips li::before { content: ''; position: absolute; left: 0; top: 0.5rem; width: 4px; height: 4px; background: var(--primary-500); border-radius: 50%; }
        .email-bound, .email-disabled, .phone-bound { text-align: center; padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; }
        .success-icon, .warning-icon { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
        .success-icon { background: var(--success-dim); color: var(--success); }
        .warning-icon { background: var(--warning-dim); color: var(--warning); }
        .email-bound h3, .email-disabled h3, .phone-bound h3 { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
        .bound-email, .bound-phone { font-size: 1rem; color: var(--primary-500); font-weight: 500; margin-bottom: 1.5rem; }
        .email-disabled p { font-size: 0.875rem; color: var(--text-tertiary); max-width: 300px; margin: 0 auto; }
        .benefits { display: flex; flex-direction: column; gap: 0.75rem; max-width: 240px; margin: 0 auto; padding: 1rem; background: var(--bg-tertiary); border-radius: 12px; border: 1px solid var(--border-subtle); }
        .benefit-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary); }
        .benefit-item svg { color: var(--success-500); }
        .benefit-icon { color: var(--success); }
        .email-preview { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 1rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; margin-bottom: 1.25rem; color: var(--text-secondary); font-weight: 500; }
        input[type="password"]::-ms-reveal, input[type="password"]::-ms-clear { display: none; }
        input[type="password"]::-webkit-credentials-auto-fill-button { visibility: hidden; display: none !important; pointer-events: none; }
        input[type="password"]::-webkit-textfield-decoration-container { display: none; }
        [data-theme="dark"] .profile-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
        [data-theme="dark"] .input-wrapper input { background: var(--bg-primary); }
        [data-theme="dark"] .info-card { background: var(--bg-primary); }
        .wechat-bind-content { max-width: 500px; margin: 0 auto; }
        .wechat-bound, .wechat-unbound { text-align: center; padding: 2rem; display: flex; flex-direction: column; align-items: center; }
        .wechat-bound .success-icon, .wechat-unbound .unbound-icon { margin-bottom: 1.5rem; color: var(--success-500); }
        .wechat-unbound .unbound-icon { color: var(--text-muted); opacity: 0.5; }
        .wechat-bound h3, .wechat-unbound h3 { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
        .wechat-bound .bound-info, .wechat-unbound .unbound-desc { color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem; }

        .submit-button.wechat { background: #07c160; border-color: #07c160; color: white; }
        .submit-button.wechat:hover { background: #06ad56; border-color: #06ad56; box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3); }
        .submit-button.danger { background: var(--bg-secondary); border: 1px solid var(--border-default); color: var(--text-secondary); }
        .submit-button.danger:hover { background: #ef4444; border-color: #ef4444; color: white; }
        .deactivate-content { max-width: 500px; margin: 0 auto; text-align: center; padding: 2rem; }
        .deactivate-content .warning-icon { color: var(--error-500); margin-bottom: 1.5rem; }
        .deactivate-content h3 { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; }
        .deactivate-content .warning-text { color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.6; }
        .deactivate-content .warning-list { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 2rem; text-align: left; }
        .deactivate-content .warning-item { display: flex; align-items: center; gap: 0.5rem; color: var(--error-500); font-size: 0.875rem; margin-bottom: 0.5rem; }
        .deactivate-content .warning-item:last-child { margin-bottom: 0; }
        .deactivate-form .confirm-checkbox { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; }
        .deactivate-form .confirm-checkbox input { width: 16px; height: 16px; accent-color: var(--error-500); }
        .deactivate-form .confirm-checkbox label { font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; }
        .deactivate-form .verification-select { width: 100%; padding: 0.75rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.5rem; }
        .deactivate-form .verification-select:hover { border-color: var(--primary-400); }
        .deactivate-form .verification-select:focus { outline: none; border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(var(--primary-500-rgb), 0.1); }
        .wechat-warning { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(7, 193, 96, 0.08), rgba(7, 193, 96, 0.04)); border: 1px solid rgba(7, 193, 96, 0.2); border-radius: var(--radius-lg); margin-top: 0.5rem; }
        .wechat-warning > svg { color: #07c160; }
        .wechat-warning > p { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.875rem; margin: 0; }
        .wechat-warning .submit-button { display: inline-flex; align-items: center; gap: 0.5rem; background: #07c160; border-color: #07c160; color: white; padding: 0.625rem 1.25rem; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; transition: all 0.2s ease; }
        .wechat-warning .submit-button:hover:not(:disabled) { background: #06ad56; border-color: #06ad56; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3); }
        .wechat-warning .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }
        .wechat-warning.success { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05)); border-color: rgba(34, 197, 94, 0.3); }
        .wechat-warning.success > svg { color: #22c55e; }
        .wechat-warning.success > p { color: #22c55e; font-weight: 500; }
        .send-code-button { position: absolute; right: 0.5rem; padding: 0.5rem 0.875rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 8px; color: var(--primary-500); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .send-code-button:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--primary-500); }
        .send-code-button:disabled { opacity: 0.6; cursor: not-allowed; color: var(--text-muted); }
        @media (max-width: 640px) {
          .profile-page { padding: 1rem; }
          .profile-container { padding-top: 4rem; }
          .profile-header { padding: 1.5rem 1.25rem 1rem; }
          .avatar-section { flex-direction: column; text-align: center; }
          .tabs-container { margin: 1rem 1.25rem 0; }
          .tab-button { padding: 0.625rem 0.5rem; font-size: 0.8125rem; }
          .tab-button span { display: none; }
          .alert { margin: 1rem 1.25rem 0; }
          .content-area { padding: 1.25rem; }
          .info-grid { grid-template-columns: 1fr; }
          .back-button { top: 1rem; left: 1rem; }
        }

`;
