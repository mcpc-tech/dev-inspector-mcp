import React from "react";

interface NotificationProps {
  message: string;
}

export const Notification: React.FC<NotificationProps> = ({ message }) => {
  return (
    <div className="fixed top-5 right-5 z-[1000000] animate-in slide-in-from-right duration-300">
      <div className="bg-background border border-border rounded-lg shadow-lg px-4 py-3 text-sm font-medium text-foreground backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
};
