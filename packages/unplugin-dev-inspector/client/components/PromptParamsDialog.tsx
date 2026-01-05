import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Prompt } from "../constants/types";

interface PromptParamsDialogProps {
    prompt: Prompt | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (args: Record<string, string>) => void;
}

export function PromptParamsDialog({
    prompt,
    isOpen,
    onOpenChange,
    onSubmit,
}: PromptParamsDialogProps) {
    const [args, setArgs] = useState<Record<string, string>>({});

    // Reset args when prompt changes
    useEffect(() => {
        if (prompt) {
            setArgs({});
        }
    }, [prompt]);

    if (!prompt) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(args);
        onOpenChange(false);
    };

    const handleInputChange = (name: string, value: string) => {
        setArgs((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    // Check if all required arguments are filled
    const isValid = prompt.arguments?.every((arg) => {
        if (arg.required !== false) { // Default to required if not specified or explicit true
            return !!args[arg.name]?.trim();
        }
        return true;
    }) ?? true;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{prompt.title || prompt.name}</DialogTitle>
                    <DialogDescription>
                        {prompt.description || "Please provide the following arguments."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {prompt.arguments?.map((arg) => (
                        <div key={arg.name} className="grid gap-2">
                            <label
                                htmlFor={arg.name}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                {arg.name}
                                {arg.required !== false && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <Input
                                id={arg.name}
                                placeholder={arg.description}
                                value={args[arg.name] || ""}
                                onChange={(e) => handleInputChange(arg.name, e.target.value)}
                                required={arg.required !== false}
                            />
                            {arg.description && (
                                <p className="text-[0.8rem] text-muted-foreground">
                                    {arg.description}
                                </p>
                            )}
                        </div>
                    ))}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!isValid}>
                            Run Prompt
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
