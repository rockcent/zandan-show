import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface Soulmate {
  userId: string;
  username: string;
  avatar_url: string;
  affinity: number;
  commonTopics: number;
}

export async function calculateSoulmateAffinity(currentUserId: string): Promise<Soulmate[]> {
  // 1. Fetch current user's votes
  const currentUserVotesQuery = query(collection(db, 'votes'), where('user_id', '==', currentUserId));
  const currentUserVotesSnap = await getDocs(currentUserVotesQuery);
  
  const currentUserVotes = new Map<string, string>(); // topic_id -> stance
  currentUserVotesSnap.forEach(doc => {
    const data = doc.data();
    currentUserVotes.set(data.topic_id, data.stance);
  });

  if (currentUserVotes.size === 0) return [];

  // 2. Fetch all active users
  const activeUsersQuery = query(collection(db, 'users'), where('status', '==', 'ACTIVE'));
  const activeUsersSnap = await getDocs(activeUsersQuery);
  const activeUserIds = new Set<string>();
  const activeUserMap = new Map<string, any>();
  
  activeUsersSnap.forEach(doc => {
    if (doc.id !== currentUserId) {
      activeUserIds.add(doc.id);
      activeUserMap.set(doc.id, doc.data());
    }
  });

  if (activeUserIds.size === 0) return [];

  // 3. Fetch all other votes
  // In a real production app, this would be a backend Cloud Function or an optimized query.
  // For this prototype, we fetch all votes to calculate affinities client-side.
  const allVotesSnap = await getDocs(collection(db, 'votes'));
  
  const otherUsersVotes = new Map<string, Map<string, string>>(); // user_id -> (topic_id -> stance)
  
  allVotesSnap.forEach(doc => {
    const data = doc.data();
    if (data.user_id === currentUserId || !activeUserIds.has(data.user_id)) return;
    
    if (!otherUsersVotes.has(data.user_id)) {
      otherUsersVotes.set(data.user_id, new Map<string, string>());
    }
    otherUsersVotes.get(data.user_id)!.set(data.topic_id, data.stance);
  });

  const soulmates: Soulmate[] = [];

  // 4. Calculate affinity
  for (const [userId, votes] of otherUsersVotes.entries()) {
    let commonTopics = 0;
    let sameStance = 0;

    for (const [topicId, stance] of currentUserVotes.entries()) {
      if (votes.has(topicId)) {
        commonTopics++;
        if (votes.get(topicId) === stance) {
          sameStance++;
        }
      }
    }

    if (commonTopics >= 10) {
      const affinity = (sameStance / commonTopics) * 100;
      if (affinity >= 85) {
        soulmates.push({
          userId,
          username: 'User', // Placeholder, will fetch real data below
          avatar_url: '',
          affinity,
          commonTopics
        });
      }
    }
  }

  // Sort by affinity descending
  soulmates.sort((a, b) => b.affinity - a.affinity);
  
  // Take top 3
  const top3 = soulmates.slice(0, 3);

  // 5. Populate user details for top 3
  for (const soulmate of top3) {
    const userData = activeUserMap.get(soulmate.userId);
    if (userData) {
      soulmate.username = userData.username || 'Anonymous';
      soulmate.avatar_url = userData.avatar_url || '';
    }
  }

  return top3;
}
