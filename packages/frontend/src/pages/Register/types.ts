export interface FieldErrors {
  username?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  code?: string;
  password?: string;
  confirmPassword?: string;
  agreedToTerms?: string;
}

export type RegisterFieldName =
  | 'username'
  | 'nickname'
  | 'email'
  | 'password'
  | 'confirmPassword';
