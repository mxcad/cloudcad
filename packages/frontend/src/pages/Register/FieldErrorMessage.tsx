import React from 'react';
import styles from './register.module.css';

interface FieldErrorMessageProps {
  /** 与输入框的 aria-describedby 对应 */
  id: string;
  children: React.ReactNode;
}

/** 字段级校验错误：统一样式与 id，供 aria-describedby 关联到输入框 */
export const FieldErrorMessage: React.FC<FieldErrorMessageProps> = ({
  id,
  children,
}) => (
  <p id={id} className={styles.errorMessage}>
    {children}
  </p>
);
