export interface IEmailVerificationService {
  sendVerificationEmail: (email: string) => Promise<void>;
  verifyEmail: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; message?: string }>;
}
