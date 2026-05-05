///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';

interface SupportModalProps {
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ onClose }) => {
  return (
    <div className="support-modal-overlay">
      <div className="support-modal">
        <div className="support-modal-header">
          <h3>账号已被禁用</h3>
          <button className="support-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="support-modal-content">
          <p className="support-modal-message">
            您的账号已被禁用，无法登录系统。
            <br />
            如有疑问，请联系客服人员获取帮助。
          </p>
          <div className="support-contact-info">
            <div className="support-contact-item">
              <span className="support-contact-label">客服邮箱：</span>
              <a href="mailto:support@cloudcad.com" className="support-contact-link">
                support@cloudcad.com
              </a>
            </div>
            <div className="support-contact-item">
              <span className="support-contact-label">客服电话：</span>
              <a href="tel:400-123-4567" className="support-contact-link">
                400-123-4567
              </a>
            </div>
            <div className="support-contact-item">
              <span className="support-contact-label">工作时间：</span>
              <span className="support-contact-value">周一至周五 9:00-18:00</span>
            </div>
          </div>
        </div>
        <div className="support-modal-footer">
          <button className="support-modal-button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
