// src/hooks/useMessages.ts - Fixed to work with subcollections

import { useState, useEffect } from 'react';
import { Firestore, collection, query, orderBy, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { Message } from '@/lib/types';

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
      setLoading(false);
      return;
    }

    setLoading(true);

    // Subscribe to messages subcollection
    const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedMessages: Message[] = snapshot.docs.map(doc => ({
          id: doc.id,
          text: doc.data().text || '',
          sender: doc.data().sender || 'ai',
        }));
        setMessages(loadedMessages);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching messages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, chatId, db]);

  return { messages, setMessages, loading };
}