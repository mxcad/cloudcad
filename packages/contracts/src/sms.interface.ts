export interface ISmsVerificationService {
  sendVerificationCode: (phone: string) => Promise<{ success: boolean; message: string }>;
  verifyCode: (
    phone: string,
    code: string,
  ) => Promise<{ valid: boolean; message: string; remainingAttempts?: number; expiresIn?: number }>;
}
