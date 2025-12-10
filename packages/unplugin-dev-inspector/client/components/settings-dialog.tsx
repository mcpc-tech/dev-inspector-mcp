"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Settings } from "lucide-react";

interface SettingsDialogProps {
  apiKey?: string;
  onApiKeyChange?: (apiKey: string) => void;
  selectedAgentName?: string;
  requiredKeyNames?: string[];
  values?: Record<string, string>;
  onChange?: (key: string, value: string) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  apiKey = "",
  onApiKeyChange,
  selectedAgentName = "Agent",
  requiredKeyNames = ["API_KEY"],
  values = {},
  onChange,
}) => {
  const [tempKeys, setTempKeys] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    requiredKeyNames.forEach((k) => {
      initial[k] = values[k] ?? "";
    });
    return initial;
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updated: Record<string, string> = {};
    requiredKeyNames.forEach((k) => {
      updated[k] = values[k] ?? "";
    });
    setTempKeys(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(requiredKeyNames), JSON.stringify(values)]);

  const handleSave = () => {
    if (onApiKeyChange && requiredKeyNames.length === 1) {
      onApiKeyChange(tempKeys[requiredKeyNames[0]] ?? "");
    }

    if (onChange) {
      Object.entries(tempKeys).forEach(([k, v]) => onChange(k, v));
    }

    setIsOpen(false);
  };

  const handleCancel = () => {
    const reset: Record<string, string> = {};
    requiredKeyNames.forEach((k) => {
      reset[k] = values[k] ?? "";
    });
    setTempKeys(reset);
    setIsOpen(false);
  };

  const hasAllRequiredKeys =
    requiredKeyNames.length === 0 ||
    requiredKeyNames.every((k) => (values[k] ?? "").trim().length > 0) ||
    (requiredKeyNames.length === 1 && apiKey.trim().length > 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={hasAllRequiredKeys ? "outline" : "destructive"}
          size="sm"
          className={!hasAllRequiredKeys ? "animate-pulse" : ""}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="space-y-3">
          <DialogTitle>Settings - {selectedAgentName}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Configure your keys to use the {selectedAgentName} functionality.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {requiredKeyNames.map((keyName) => (
            <div key={keyName} className="space-y-2">
              <label htmlFor={keyName} className="text-sm font-medium">
                {keyName}
              </label>
              <Input
                id={keyName}
                type="password"
                value={tempKeys[keyName] ?? ""}
                onChange={(e) =>
                  setTempKeys((s) => ({
                    ...s,
                    [keyName]: e.target.value,
                  }))
                }
                className="w-full"
                placeholder={`Enter your ${keyName}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
