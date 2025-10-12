// src/lib/messageStorage.ts - Scalable message storage using subcollections

import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  query, 
  orderBy, 
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';
import { Message } from './types';

/**
 * Add a message to a chat using subcollections
 * This allows unlimited messages without hitting Firestore document size limits
 */
export async function addMessage(
  db: Firestore,
  userId: string,
  chatId: string,
  message: Message
): Promise<void> {
  const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    ...message,
    timestamp: Date.now(),
  });

  // Update chat metadata
  const chatRef = doc(db, 'users', userId, 'chats', chatId);
  await updateDoc(chatRef, {
    lastMessageAt: Date.now(),
    messageCount: (await getDocs(query(messagesRef))).size,
  });
}

/**
 * Subscribe to messages in real-time with pagination support
 */
export function subscribeToMessages(
  db: Firestore,
  userId: string,
  chatId: string,
  onMessagesUpdate: (messages: Message[]) => void,
  messageLimit: number = 50
): Unsubscribe {
  const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(messageLimit));

  return onSnapshot(q, (snapshot) => {
    const messages: Message[] = snapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text,
      sender: doc.data().sender,
    }));
    onMessagesUpdate(messages);
  });
}

/**
 * Load older messages (pagination)
 */
export async function loadOlderMessages(
  db: Firestore,
  userId: string,
  chatId: string,
  oldestMessageDoc: DocumentSnapshot,
  messageLimit: number = 50
): Promise<Message[]> {
  const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    orderBy('timestamp', 'desc'),
    startAfter(oldestMessageDoc),
    limit(messageLimit)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    text: doc.data().text,
    sender: doc.data().sender,
  })).reverse(); // Reverse to maintain chronological order
}

/**
 * Delete all messages in a chat
 */
export async function deleteAllMessages(
  db: Firestore,
  userId: string,
  chatId: string
): Promise<void> {
  const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
  const snapshot = await getDocs(messagesRef);
  
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
}

/**
 * Get message count for a chat
 */
export async function getMessageCount(
  db: Firestore,
  userId: string,
  chatId: string
): Promise<number> {
  const messagesRef = collection(db, 'users', userId, 'chats', chatId, 'messages');
  const snapshot = await getDocs(messagesRef);
  return snapshot.size;
}