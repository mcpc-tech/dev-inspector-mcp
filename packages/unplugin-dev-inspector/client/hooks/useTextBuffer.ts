import { useState, useEffect, useRef } from "react";

/**
 * A hook to buffer text updates to avoid rapid flickering.
 * It waits for sentence endings or a full buffer before updating,
 * and throttles updates to a maximum speed.
 */
export function useTextBuffer(targetText: string, isStreaming: boolean, throttleMs: number = 50) {
  const [displayedText, setDisplayedText] = useState("");
  const lastUpdateRef = useRef(0);
  const lastSourceTextRef = useRef("");

  useEffect(() => {
    // 1. Handle Reset/Context Switch
    // If the new text is shorter than what we have, or doesn't start with what we have,
    // it's a reset or new context.
    if (
      targetText.length < displayedText.length ||
      (displayedText &&
        !targetText.startsWith(displayedText.slice(0, Math.min(displayedText.length, 20))))
    ) {
      setDisplayedText(targetText);
      lastSourceTextRef.current = targetText;
      lastUpdateRef.current = Date.now();
      return;
    }

    // 2. Handle Completion
    // If streaming is done, ensure we show everything
    if (!isStreaming) {
      if (displayedText !== targetText) {
        setDisplayedText(targetText);
        lastSourceTextRef.current = targetText;
      }
      return;
    }

    // 3. Calculate Pending Content
    const newContent = targetText.slice(lastSourceTextRef.current.length);
    if (!newContent) return;

    // 4. Check Throttling
    const now = Date.now();
    if (now - lastUpdateRef.current < throttleMs) {
      return;
    }

    // 5. Check Content Rules
    // - Update on sentence endings
    // - Update if buffer gets too full (> 50 chars)
    // - Don't update for tiny fragments (< 5 chars) unless buffer is full
    const hasSentenceEnd = /[.?!。？！](\s|$)|[\n]/.test(newContent);
    const isBufferFull = newContent.length > 50;
    const isTooShort = newContent.trim().length < 5;

    if ((hasSentenceEnd && !isTooShort) || isBufferFull) {
      setDisplayedText(targetText);
      lastSourceTextRef.current = targetText;
      lastUpdateRef.current = now;
    }
  }, [targetText, isStreaming, throttleMs, displayedText]);

  return displayedText;
}
