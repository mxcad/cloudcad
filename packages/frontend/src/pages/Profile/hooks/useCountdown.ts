import { useEffect, useRef, useState } from 'react';

export function useCountdown() {
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    countdownRef.current = id;
    return () => {
      clearInterval(id);
      countdownRef.current = null;
    };
  }, [countdown]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return {
    countdown,
    setCountdown,
  };
}
