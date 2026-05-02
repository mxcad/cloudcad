import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVerificationCodeOptions {
  onSend: (...args: any[]) => Promise<any>;
  onVerify?: (...args: any[]) => Promise<any>;
  countdownKey?: string;
  initialCountdown?: number;
}

export const useVerificationCode = ({
  onSend,
  onVerify,
  countdownKey = 'default',
  initialCountdown = 60,
}: UseVerificationCodeOptions) => {
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current && countdown <= 0) {
        clearInterval(countdownRef.current);
      }
    };
  }, [countdown > 0]);

  const sendCode = useCallback(async (...args: any[]) => {
    setSendingCode(true);
    try {
      await onSend(...args);
      setCountdown(initialCountdown);
      return true;
    } catch (error) {
      throw error;
    } finally {
      setSendingCode(false);
    }
  }, [onSend, initialCountdown]);

  const verifyCode = useCallback(async (...args: any[]) => {
    if (!onVerify) {
      throw new Error('onVerify function not provided');
    }
    setVerifying(true);
    try {
      const result = await onVerify(...args);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setVerifying(false);
    }
  }, [onVerify]);

  const resetCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  }, []);

  return {
    countdown,
    sendingCode,
    verifying,
    sendCode,
    verifyCode,
    resetCountdown,
    canSendCode: countdown === 0 && !sendingCode,
  };
};