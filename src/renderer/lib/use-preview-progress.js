import { useCallback, useEffect, useRef, useState } from "react";

export function usePreviewProgress() {
  const request = useRef(null);
  const [progress, setProgress] = useState({ stage: "previewReading" });
  useEffect(
    () =>
      window.aldus.onPreviewProgress((next) => {
        if (next.requestId === request.current)
          setProgress({ stage: next.stage });
      }),
    [],
  );
  const begin = useCallback(() => {
    request.current = crypto.randomUUID();
    setProgress({ stage: "previewReading" });
    return request.current;
  }, []);
  const cancel = useCallback(() => {
    request.current = null;
  }, []);
  const onPages = useCallback((completed, total) => {
    if (request.current)
      setProgress({ stage: "previewPages", completed, total });
  }, []);
  return { progress, begin, cancel, onPages };
}
