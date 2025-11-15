// src/hooks/useMessages.ts - With pagination and virtual scrolling

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Firestore, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  Unsubscribe 
} from 'firebase/firestore';
import { Message } from '@/lib/types';

const MESSAGES_PER_PAGE = 50;

export function useMessages(
  userId: string | undefined,
  chatId: string | null,
  db: Firestore
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestDoc, setOldestDoc] = useState<QueryDocumentSnapshot | null>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Load initial messages
  useEffect(() => {
    if (!userId || !chatId) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    setLoading(true);

    const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(MESSAGES_PER_PAGE));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedMessages: Message[] = [];
        let oldestSnapshot: QueryDocumentSnapshot | null = null;

        snapshot.docs.forEach((doc, index) => {
          loadedMessages.push({
            id: doc.id,
            text: doc.data().text || '',
            sender: doc.data().sender || 'ai',
          });

          if (index === snapshot.docs.length - 1) {
            oldestSnapshot = doc;
          }
        });

        // Reverse to show oldest first
        setMessages(loadedMessages.reverse());
        setOldestDoc(oldestSnapshot);
        setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching messages:', error);
        setLoading(false);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [userId, chatId, db]);

  // Load older messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!userId || !chatId || !oldestDoc || !hasMore || loading) {
      return;
    }

    setLoading(true);

    try {
      const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        startAfter(oldestDoc),
        limit(MESSAGES_PER_PAGE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      const olderMessages: Message[] = [];
      let newOldestDoc: QueryDocumentSnapshot | null = null;

      snapshot.docs.forEach((doc, index) => {
        olderMessages.push({
          id: doc.id,
          text: doc.data().text || '',
          sender: doc.data().sender || 'ai',
        });

        if (index === snapshot.docs.length - 1) {
          newOldestDoc = doc;
        }
      });

      // Prepend older messages (reversed)
      setMessages(prev => [...olderMessages.reverse(), ...prev]);
      setOldestDoc(newOldestDoc);
      setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
      setLoading(false);
    } catch (error) {
      console.error('Error loading more messages:', error);
      setLoading(false);
    }
  }, [userId, chatId, db, oldestDoc, hasMore, loading]);

  return { 
    messages, 
    setMessages, 
    loading, 
    hasMore, 
    loadMoreMessages 
  };
}

// Intersection Observer Hook for infinite scroll
export function useInfiniteScroll(
  loadMore: () => void,
  hasMore: boolean,
  loading: boolean
) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(target);

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [loadMore, hasMore, loading]);

  return observerTarget;
}