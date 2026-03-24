"use client";

import { useEffect, useState } from "react";

interface StreamingTextProps {
  content: string;
}

export function StreamingText({ content }: StreamingTextProps) {
  const [displayedContent, setDisplayedContent] = useState("");

  useEffect(() => {
    // Typewriter effect - show text character by character
    let index = 0;
    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayedContent(content.substring(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 10); // Adjust speed here (10ms per character)

    return () => clearInterval(interval);
  }, [content]);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {displayedContent}
      {displayedContent.length < content.length && (
        <span className="animate-pulse">▊</span>
      )}
    </p>
  );
}
