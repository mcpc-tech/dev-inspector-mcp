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

const logs: ConsoleLog[] = [];
const networkRequests: NetworkRequest[] = [];
let nextLogId = 1;
let nextRequestId = 1;
const MAX_LOGS = 500;
const MAX_REQUESTS = 500;

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

export function addNetworkRequest(request: Omit<NetworkRequest, "id" | "timestamp">) {
  const req: NetworkRequest = {
    id: nextRequestId++,
    timestamp: Date.now(),
    ...request,
  };
  networkRequests.push(req);
  while (networkRequests.length > MAX_REQUESTS) networkRequests.shift();
  return req;
}

export function getLogs() {
  return [...logs]; // Return in insertion order (oldest first)
}

export function getNetworkRequests() {
  return [...networkRequests]; // Return in insertion order (oldest first)
}

export function getLogById(id: number) {
  return logs.find((l) => l.id === id);
}

export function getRequestById(id: number) {
  return networkRequests.find((r) => r.id === id);
}

export function clearLogs() {
  logs.length = 0;
  nextLogId = 1;
}

export function clearNetworkRequests() {
  networkRequests.length = 0;
  nextRequestId = 1;
}
