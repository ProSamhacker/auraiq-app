// src/hooks/useStreamingChat.ts - Custom hook for streaming chat

import { useState, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { Message } from '@/lib/types';

interface StreamingChatOptions {
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

export function useStreamingChat(user: User | null, options?: StreamingChatOptions) {
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState({ remaining: 20, limit: 20 });
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (
    input: string,
    attachments: File[],
    taskType: 'auto' | 'daily' | 'coding',
    context: string,
    history: Message[],
    contextFileUrls: string[]
  ) => {
    if (!user) {
      options?.onError?.(new Error('User not authenticated'));
      return null;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('input', input);
      formData.append('taskType', taskType);
      formData.append('context', context);
      formData.append('history', JSON.stringify(history));
      formData.append('contextFileUrls', JSON.stringify(contextFileUrls));

      attachments.forEach(file => {
        formData.append('files', file);
      });

      const token = await user.getIdToken();

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: abortController.signal,
      });

      // Extract rate limit info
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const limit = response.headers.get('X-RateLimit-Limit');
      if (remaining && limit) {
        setRateLimitInfo({ remaining: parseInt(remaining), limit: parseInt(limit) });
      }

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a minute before trying again.');
        }
        throw new Error(errorData.error || 'API error');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const aiMessageId = (Date.now() + 1).toString();
      let fullText = '';

      setStreamingMessage({ id: aiMessageId, text: '', sender: 'ai' });

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data.trim() === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                setStreamingMessage({ id: aiMessageId, text: fullText, sender: 'ai' });
              }
            } catch (_e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

      const finalMessage: Message = { id: aiMessageId, text: fullText, sender: 'ai' };
      setStreamingMessage(null);
      setIsLoading(false);
      options?.onSuccess?.();
      
      return finalMessage;

    } catch (error) {
      const err = error as Error;
      
      if (err.name === 'AbortError') {
        console.log('Fetch aborted by user');
        setStreamingMessage(null);
        setIsLoading(false);
        return null;
      }

      console.error('Streaming chat error:', err);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        text: `Error: ${err.message || 'An unknown error occurred'}`,
        sender: 'ai'
      };
      setStreamingMessage(errorMessage);
      setIsLoading(false);
      options?.onError?.(err);
      
      return errorMessage;
    } finally {
      abortControllerRef.current = null;
    }
  }, [user, options]);

  return {
    streamingMessage,
    isLoading,
    rateLimitInfo,
    sendMessage,
    stopGenerating,
  };
}