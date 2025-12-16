import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { Agent } from '../constants/agents';
import { DEFAULT_AGENT } from '../constants/agents';

// Server port - dynamically fetched from Electron main or defaults to 8888
const DEFAULT_PORT = 8888;

export type AgentState =
  | { type: 'idle' }
  | { type: 'thinking'; message?: string }
  | { type: 'executing'; toolName: string; args?: Record<string, unknown> }
  | { type: 'error'; message: string };

export function useAcp() {
  const [agent, setAgent] = useState<Agent>(DEFAULT_AGENT);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverPort, setServerPort] = useState(DEFAULT_PORT);
  const sessionIdRef = useRef<string | null>(null);

  // Get server port from Electron main
  useEffect(() => {
    if (window.electronAPI?.getServerPort) {
      window.electronAPI.getServerPort().then(setServerPort);
    }
  }, []);

  const baseUrl = `http://localhost:${serverPort}`;

  // useChat - same pattern as AcpAgent.tsx
  const { messages, sendMessage: chatSendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${baseUrl}/api/acp/chat`,
    }),
  });

  // Derive state from chat status
  const getState = (): AgentState => {
    if (status === 'submitted' || status === 'streaming') {
      // Check latest message for tool calls
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.parts) {
        const toolPart = lastMsg.parts.find((p: any) => p.type === 'tool-invocation');
        if (toolPart) {
          return { 
            type: 'executing', 
            toolName: (toolPart as any).toolInvocation?.toolName || 'tool' 
          };
        }
      }
      return { type: 'thinking', message: 'Processing...' };
    }
    return { type: 'idle' };
  };

  // Init session when agent changes
  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      // Cleanup previous session
      if (sessionIdRef.current) {
        fetch(`${baseUrl}/api/acp/cleanup-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {});
      }

      try {
        const response = await fetch(`${baseUrl}/api/acp/init-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent, envVars: {} }),
        });
        if (!cancelled && response.ok) {
          const data = await response.json();
          setSessionId(data.sessionId);
          sessionIdRef.current = data.sessionId;
          console.log('[DynamicIsland] Session initialized:', data.sessionId);
        }
      } catch (error) {
        console.error('[DynamicIsland] Failed to init session:', error);
      }
    };
    initSession();

    return () => { cancelled = true; };
  }, [agent, baseUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        const url = `http://localhost:${serverPort}/api/acp/cleanup-session`;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {});
      }
    };
  }, [serverPort]);

  // Send message - same pattern as AcpAgent.tsx handleSubmit
  const sendMessage = (content: string) => {
    if (!content.trim()) return;
    
    // sendMessage with { text } format and body containing agent/envVars/sessionId
    chatSendMessage(
      { text: content },
      {
        body: {
          agent,
          envVars: {},
          sessionId,
        },
      }
    );
  };

  // Cancel
  const cancel = () => {
    stop();
  };

  return {
    state: getState(),
    agent,
    setAgent,
    messages,
    sendMessage,
    cancel,
    status,
  };
}
