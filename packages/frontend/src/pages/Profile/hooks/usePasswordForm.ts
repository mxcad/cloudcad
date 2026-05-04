import { useState, useCallback } from 'react';

interface PasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ShowPassword {
  old: boolean;
  new: boolean;
  confirm: boolean;
}

interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}

export const usePasswordForm = () => {
  const [form, setForm] = useState<PasswordForm>({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [showPassword, setShowPassword] = useState<ShowPassword>({
    old: false,
    new: false,
    confirm: false,
  });

  const getPasswordStrength = useCallback((password: string): PasswordStrength => {
    if (!password) return { strength: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const levels = [
      { label: '太弱', color: '#ef4444' },
      { label: '较弱', color: '#f97316' },
      { label: '一般', color: '#eab308' },
      { label: '较强', color: '#22c55e' },
      { label: '很强', color: '#10b981' },
    ];
    return {
      strength: score,
      label: levels[score]?.label || levels[0]!.label,
      color: levels[score]?.color || levels[0]!.color,
    };
  }, []);

  const passwordStrength = getPasswordStrength(form.newPassword);

  const validateForm = useCallback((userHasPassword?: boolean) => {
    const errors: string[] = [];
    
    if (form.newPassword !== form.confirmPassword) {
      errors.push('两次输入的新密码不一致');
    }
    
    if (form.newPassword.length < 6) {
      errors.push('新密码至少需要6个字符');
    }
    
    if (userHasPassword !== false && !form.oldPassword) {
      errors.push('请输入当前密码');
    }
    
    return errors;
  }, [form]);

  const handleChange = useCallback((field: keyof PasswordForm) => 
    (value: string) => {
      setForm(prev => ({ ...prev, [field]: value }));
    }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const toggleShowPassword = useCallback((field: keyof ShowPassword) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }));
  }, []);

  const resetForm = useCallback(() => {
    setForm({
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setShowPassword({
      old: false,
      new: false,
      confirm: false,
    });
  }, []);

  return {
    form,
    showPassword,
    passwordStrength,
    handleChange,
    handleInputChange,
    toggleShowPassword,
    validateForm,
    resetForm,
  };
};