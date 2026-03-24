import { useEffect, useRef, useState, useCallback } from "react";

interface SSEOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export function useSSE() {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  const subscribe = useCallback(
    async (
      url: string,
      options: SSEOptions,
      onChunk: (chunk: string) => void
    ) => {
      return new Promise<void>((resolve, reject) => {
        try {
          // For SSE, we need to make the POST request and then read the stream
          const controller = new AbortController();

          fetch(url, {
            method: options.method || "GET",
            headers: {
              ...options.headers,
              Accept: "text/event-stream",
            },
            body: options.body,
            signal: controller.signal,
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              if (!response.body) {
                throw new Error("Response body is empty");
              }

              setIsConnected(true);
              reconnectAttemptsRef.current = 0;

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              const read = async (): Promise<void> => {
                try {
                  const { done, value } = await reader.read();

                  if (done) {
                    resolve();
                    return;
                  }

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");

                  // Keep the last incomplete line in the buffer
                  buffer = lines[lines.length - 1];

                  for (let i = 0; i < lines.length - 1; i++) {
                    const line = lines[i];

                    if (line.startsWith("data:")) {
                      const data = line.slice(5).trim();
                      if (data) {
                        onChunk(data);
                      }
                    }
                  }

                  return read();
                } catch (error) {
                  if (error instanceof Error) {
                    if (error.name === "AbortError") {
                      return;
                    }
                  }
                  throw error;
                }
              };

              read();
            })
            .catch((error) => {
              setIsConnected(false);

              if (error.name === "AbortError") {
                resolve();
                return;
              }

              // Attempt to reconnect
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                reconnectTimeoutRef.current = setTimeout(() => {
                  subscribe(url, options, onChunk)
                    .then(resolve)
                    .catch(reject);
                }, RECONNECT_DELAY);
              } else {
                reject(error);
              }
            });
        } catch (error) {
          setIsConnected(false);
          reject(error);
        }
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    subscribe,
    isConnected,
  };
}
