import { useState, useCallback } from "react";

export const useNotification = (duration = 2500) => {
  const [notification, setNotification] = useState<string | null>(null);

  const showNotif = useCallback(
    (message: string) => {
      setNotification(message);
      setTimeout(() => {
        setNotification(null);
      }, duration);
    },
    [duration],
  );

  return { notification, showNotif };
};
