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
  status: number;
  duration: number;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
}

const logs: ConsoleLog[] = [];
const networkRequests: NetworkRequest[] = [];
let nextLogId = 1;
let nextRequestId = 1;
const MAX_LOGS = 1000;
const MAX_REQUESTS = 1000;

export function addLog(type: ConsoleLog["type"], args: any[]) {
  const log: ConsoleLog = {
    id: nextLogId++,
    type,
    args,
    timestamp: Date.now(),
  };
  logs.push(log);
  if (logs.length > MAX_LOGS) logs.shift();
  return log;
}

export function addNetworkRequest(request: Omit<NetworkRequest, "id" | "timestamp">) {
  const req: NetworkRequest = {
    id: nextRequestId++,
    timestamp: Date.now(),
    ...request,
  };
  networkRequests.push(req);
  if (networkRequests.length > MAX_REQUESTS) networkRequests.shift();
  return req;
}

export function getLogs() {
  return [...logs];
}

export function getNetworkRequests() {
  return [...networkRequests];
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
