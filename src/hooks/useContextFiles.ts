// src/hooks/useContextFiles.ts - Custom hook for context file management

import { useState, useEffect } from 'react';
import { Firestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';

export interface ContextFile {
  id: string;
  name: string;
  url: string;
}

export function useContextFiles(userId: string | undefined, db: Firestore) {
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setContextFiles([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'users', userId, 'contextFiles'),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const files: ContextFile[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        url: doc.data().url,
      }));
      setContextFiles(files);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching context files:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, db]);

  return { contextFiles, loading };
}