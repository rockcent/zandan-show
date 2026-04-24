import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isAuthReady: false });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if user document exists, if not create it
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            await setDoc(userRef, {
              username: currentUser.displayName || 'Anonymous',
              avatar_url: currentUser.photoURL || '',
              total_votes: 0,
              insight_score: 0,
              title: '初出茅庐',
              status: 'ACTIVE',
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            console.error('Error creating user profile', error);
          }
        } else {
          // Merge missing fields for existing users
          const data = userSnap.data();
          const updates: any = {};
          if (!data.username || data.username.length > 50) updates.username = (data.username || currentUser.displayName || 'Anonymous').substring(0, 50);
          if (data.avatar_url === undefined || (data.avatar_url && data.avatar_url.length > 2000)) updates.avatar_url = (data.avatar_url || currentUser.photoURL || '').substring(0, 2000);
          if (data.total_votes === undefined || data.total_votes < 0) updates.total_votes = Math.max(0, data.total_votes || 0);
          if (data.insight_score === undefined || data.insight_score < 0) updates.insight_score = Math.max(0, data.insight_score || 0);
          if (data.title === undefined || (data.title && data.title.length > 100)) updates.title = (data.title || '初出茅庐').substring(0, 100);
          if (data.status === undefined || !['ACTIVE', 'BANNED'].includes(data.status)) updates.status = 'ACTIVE';
          if (!data.createdAt || !(data.createdAt instanceof Timestamp)) updates.createdAt = serverTimestamp();
          
          // Clean up old fields
          const allowedFields = ['username', 'avatar_url', 'total_votes', 'insight_score', 'title', 'status', 'createdAt'];
          Object.keys(data).forEach(key => {
            if (!allowedFields.includes(key)) {
              updates[key] = deleteField();
            }
          });
          
          if (Object.keys(updates).length > 0) {
            try {
              await setDoc(userRef, updates, { merge: true });
            } catch (error) {
              console.error('Error updating user profile', error);
            }
          }
        }
      }
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
