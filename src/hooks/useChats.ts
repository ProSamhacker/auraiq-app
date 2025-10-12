// src/hooks/useChats.ts - Custom hook for chat management

import { useState, useEffect, useRef } from 'react';
import { Firestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Chat } from '@/lib/types';

export function useChats(userId: string | undefined, db: Firestore) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (!userId) {
      setChats([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', userId, 'chats'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const userChats: Chat[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        title: docSnap.data().title,
        timestamp: docSnap.data().timestamp,
        messages: [],
      }));

      setChats(userChats);
      setLoading(false);

      // Auto-select first chat on initial load
      if (isInitialLoad.current && userChats.length > 0 && !currentChatId) {
        setCurrentChatId(userChats[0].id);
        isInitialLoad.current = false;
      }
    }, (error) => {
      console.error('Error fetching chats:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, db, currentChatId]);

  const createNewChat = () => {
    setCurrentChatId(null);
    isInitialLoad.current = false;
  };

  return {
    chats,
    currentChatId,
    setCurrentChatId,
    createNewChat,
    loading,
  };
}