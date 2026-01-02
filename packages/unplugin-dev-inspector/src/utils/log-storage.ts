export interface ConsoleLog {
  id: number;
  type: "log" | "warn" | "error" | "info" | "debug";
  args: any[];
  timestamp: number;
}

export interface NetworkRequest {
  id: number;
  method: string;
  url: string;
  status: number | string;
  duration: number;
  timestamp: number;
  details?: string; // Full request/response details
}

export interface StdioLog {
  id: number;
  stream: "stdout" | "stderr";
  data: string;
  timestamp: number;
}

const logs: ConsoleLog[] = [];
const networkRequests: NetworkRequest[] = [];
const stdioLogs: StdioLog[] = [];
let nextLogId = 1;
let nextRequestId = 1;
let nextStdioId = 1;
const MAX_LOGS = 500;
const MAX_REQUESTS = 500;
const MAX_STDIO_LOGS = 500;

export function addLog(type: ConsoleLog["type"], args: any[]) {
  const log: ConsoleLog = {
    id: nextLogId++,
    type,
    args,
    timestamp: Date.now(),
  };
  logs.push(log);
  while (logs.length > MAX_LOGS) logs.shift();
  return log;
}

export function addNetworkRequest(
  request: Omit<NetworkRequest, "id" | "timestamp">,
) {
  const req: NetworkRequest = {
    id: nextRequestId++,
    timestamp: Date.now(),
    ...request,
  };
  networkRequests.push(req);
  while (networkRequests.length > MAX_REQUESTS) networkRequests.shift();
  return req;
}

export function addStdioLog(stream: StdioLog["stream"], data: string) {
  const log: StdioLog = {
    id: nextStdioId++,
    stream,
    data,
    timestamp: Date.now(),
  };
  stdioLogs.push(log);
  while (stdioLogs.length > MAX_STDIO_LOGS) stdioLogs.shift();
  return log;
}

export function getLogs() {
  return [...logs]; // Return in insertion order (oldest first)
}

export function getNetworkRequests() {
  return [...networkRequests]; // Return in insertion order (oldest first)
}

export function getStdioLogs() {
  return [...stdioLogs]; // Return in insertion order (oldest first)
}

export function getLogById(id: number) {
  return logs.find((l) => l.id === id);
}

export function getRequestById(id: number) {
  return networkRequests.find((r) => r.id === id);
}

export function getStdioById(id: number) {
  return stdioLogs.find((s) => s.id === id);
}

export function clearLogs() {
  logs.length = 0;
  nextLogId = 1;
}

export function clearNetworkRequests() {
  networkRequests.length = 0;
  nextRequestId = 1;
}

export function clearStdioLogs() {
  stdioLogs.length = 0;
  nextStdioId = 1;
}
