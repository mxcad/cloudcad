import { useState, useCallback, useRef } from 'react';

export function useRoleFeedback() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  const showError = useCallback((message: string) => {
    setErrorModalMessage(message);
    setErrorModalOpen(true);
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrorModalOpen(false);
    setErrorModalMessage('');
  }, []);

  return {
    successMessage,
    errorModalOpen,
    errorModalMessage,
    showSuccess,
    showError,
    closeErrorModal,
  };
}
