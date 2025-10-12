// src/hooks/useMessages.ts - Custom hook for message management

import { useState, useEffect } from 'react';
import { Firestore } from 'firebase/firestore';
import { Message } from '@/lib/types';
import { subscribeToMessages } from '@/lib/messageStorage';

export function useMessages(
  userId: string | undefined,
  chatId: string | null,
  db: Firestore
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !chatId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToMessages(
      db,
      userId,
      chatId,
      (newMessages) => {
        setMessages(newMessages);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, chatId, db]);

  return { messages, setMessages, loading };
}