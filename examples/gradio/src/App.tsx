import { useState } from "react";
import { Client } from "@gradio/client";

interface SpaceInfo {
  name: string;
  endpoints: number;
  status: "online" | "offline" | "loading";
}

interface PredictResult {
  data: unknown;
  duration: string;
  endpoint: string;
}

function StatusDot({ status }: { status: SpaceInfo["status"] }) {
  const colors = {
    online: "bg-emerald-500",
    offline: "bg-zinc-300 dark:bg-zinc-600",
    loading: "bg-yellow-500 animate-pulse",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

function SpaceCard({ 
  space, 
  onSelect,
  selected,
}: { 
  space: SpaceInfo;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        selected 
          ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800" 
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <StatusDot status={space.status} />
        <span className="font-mono text-sm text-zinc-900 dark:text-white">{space.name}</span>
      </div>
      <div className="mt-2 text-xs text-zinc-500">
        {space.status === "loading" ? "Connecting..." : space.endpoints > 0 ? `${space.endpoints} endpoints` : "Click to connect"}
      </div>
    </button>
  );
}

export default function App() {
  // Real Hugging Face Spaces to explore
  const [spaces, setSpaces] = useState<SpaceInfo[]>([
    { name: "gradio/calculator", endpoints: 0, status: "offline" },
    { name: "hf-audio/whisper-large-v3-turbo", endpoints: 0, status: "offline" },
    { name: "black-forest-labs/FLUX.1-schnell", endpoints: 0, status: "offline" },
  ]);
  
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<string[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<PredictResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiInfo, setApiInfo] = useState<unknown>(null);

  // Connect to a space and get its API info
  const connectToSpace = async (spaceName: string) => {
    setSelectedSpace(spaceName);
    setEndpoints([]);
    setSelectedEndpoint("");
    setApiInfo(null);
    setError(null);
    
    setSpaces(prev => prev.map(s => 
      s.name === spaceName ? { ...s, status: "loading" as const } : s
    ));

    try {
      const client = await Client.connect(spaceName);
      const info = await client.view_api();
      setApiInfo(info);
      
      const namedEndpoints = Object.keys((info as { named_endpoints?: Record<string, unknown> }).named_endpoints || {});
      const unnamedEndpoints = Object.keys((info as { unnamed_endpoints?: Record<string, unknown> }).unnamed_endpoints || {}).map(i => `/${i}`);
      const allEndpoints = [...namedEndpoints, ...unnamedEndpoints];
      
      setEndpoints(allEndpoints);
      if (allEndpoints.length > 0) {
        setSelectedEndpoint(allEndpoints[0]);
      }

      setSpaces(prev => prev.map(s => 
        s.name === spaceName 
          ? { ...s, endpoints: allEndpoints.length, status: "online" as const } 
          : s
      ));

      // Set default input based on space
      if (spaceName.includes("calculator")) {
        setInputValue('[4, "add", 5]');
      } else if (spaceName.includes("whisper")) {
        setInputValue('["https://github.com/gradio-app/gradio/raw/main/test/test_files/audio_sample.wav"]');
      } else if (spaceName.includes("FLUX")) {
        setInputValue('["a cat wearing sunglasses", 0, true, 1024, 1024, 4]');
      } else {
        setInputValue('[]');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpaces(prev => prev.map(s => 
        s.name === spaceName ? { ...s, status: "offline" as const } : s
      ));
    }
  };

  // Run prediction
  const runPredict = async () => {
    if (!selectedSpace || !selectedEndpoint) return;
    
    setLoading(true);
    setError(null);
    const startTime = performance.now();

    try {
      const parsedInput = JSON.parse(inputValue);
      const client = await Client.connect(selectedSpace);
      const result = await client.predict(selectedEndpoint, parsedInput);
      
      const duration = performance.now() - startTime;
      
      const formattedDuration = duration > 1000 
        ? `${duration.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}ms`
        : `${duration.toFixed(0)}ms`;
      
      setResults(prev => [{
        data: result.data,
        duration: formattedDuration,
        endpoint: selectedEndpoint,
      }, ...prev].slice(0, 5));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalDuration = results.reduce((sum, r) => {
    const numStr = r.duration.replace("ms", "");
    return sum + Number(numStr);
  }, 0);
  const avgDuration = results.length > 0 ? totalDuration / results.length : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-pink-500 rounded-lg" />
            <span className="font-semibold text-zinc-900 dark:text-white">Gradio Explorer</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-zinc-500">
              <span className="text-zinc-900 dark:text-white font-medium">{results.length}</span> calls
            </div>
            <div className="text-zinc-500">
              Avg: <span className="text-zinc-900 dark:text-white font-medium">{avgDuration.toFixed(0)}ms</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Space Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">Select a Hugging Face Space</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {spaces.map(space => (
              <SpaceCard
                key={space.name}
                space={space}
                selected={selectedSpace === space.name}
                onSelect={() => connectToSpace(space.name)}
              />
            ))}
          </div>
        </div>

        {/* API Explorer */}
        {selectedSpace && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Input Panel */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-4">
                Call <span className="font-mono text-orange-600 dark:text-orange-400">{selectedSpace}</span>
              </h3>

              {/* Endpoint Selector */}
              {endpoints.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-zinc-500 mb-2">Endpoint</label>
                  <div className="flex flex-wrap gap-2">
                    {endpoints.slice(0, 6).map(ep => (
                      <button
                        key={ep}
                        onClick={() => setSelectedEndpoint(ep)}
                        className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
                          selectedEndpoint === ep
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {ep}
                      </button>
                    ))}
                    {endpoints.length > 6 && (
                      <span className="px-3 py-1.5 text-sm text-zinc-400">+{endpoints.length - 6} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-zinc-500 mb-2">Input (JSON Array)</label>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-900 dark:text-white focus:border-zinc-400 focus:outline-none resize-none"
                  placeholder='[arg1, arg2, ...]'
                />
              </div>

              <button
                onClick={runPredict}
                disabled={loading || !selectedEndpoint}
                className="w-full rounded-md bg-zinc-900 dark:bg-white px-4 py-3 text-sm font-medium text-white dark:text-black hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {loading ? "Running..." : "▶ Run Prediction"}
              </button>

              {error && (
                <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 relative h-full">
                <h3 className="font-medium text-zinc-900 dark:text-white mb-4">
                  Results
                </h3>

                {results.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    <div className="text-4xl mb-2">🚀</div>
                    <div>Run a prediction to see results</div>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-auto">
                    {results.map((result, i) => (
                      <div 
                        key={i} 
                        className="p-4 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-zinc-500">{result.endpoint}</span>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                            {result.duration}
                          </span>
                        </div>
                        <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API Documentation */}
        {apiInfo && (
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <details>
              <summary className="font-medium text-zinc-900 dark:text-white cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300">
                📖 API Documentation
              </summary>
              <pre className="mt-4 text-xs font-mono text-zinc-600 dark:text-zinc-400 overflow-auto max-h-64 bg-zinc-50 dark:bg-zinc-800 p-4 rounded-md">
                {JSON.stringify(apiInfo, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}
