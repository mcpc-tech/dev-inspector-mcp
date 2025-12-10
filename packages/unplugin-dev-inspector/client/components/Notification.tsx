import React from "react";
import { Badge } from "./ui/badge";

interface NotificationProps {
  message: string;
}

export const Notification: React.FC<NotificationProps> = ({ message }) => {
  return (
    <div className="fixed top-5 right-5 z-[1000000] animate-in slide-in-from-right duration-300">
      <Badge variant="default" className="py-3 px-4 text-sm font-medium shadow-lg">
        {message}
      </Badge>
    </div>
  );
};
