export interface User {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  wechatId?: string;
  avatar?: string;
  status?: string;
  hasPassword?: boolean;
  role?: string;
}

export interface PasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ShowPassword {
  old: boolean;
  new: boolean;
  confirm: boolean;
}

export interface EmailForm {
  email: string;
  code: string;
}

export interface PhoneForm {
  phone: string;
  code: string;
}

export interface DeactivateForm {
  verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
  password: string;
  phoneCode: string;
  emailCode: string;
  wechatConfirm: string;
  confirmed: boolean;
}

export interface ProfileCommonProps {
  user: User | null;
  error: string | null;
  success: string | null;
  loading: boolean;
  focusedField: string | null;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
  setLoading: (loading: boolean) => void;
  setFocusedField: (field: string | null) => void;
}

export interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}
