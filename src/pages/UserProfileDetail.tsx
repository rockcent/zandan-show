import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Target, Award, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../components/AuthContext';

export default function UserProfileDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [profileUser, setProfileUser] = useState<any>(null);
  const [userVotes, setUserVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserDetails = async () => {
      if (!userId) return;
      
      try {
        // Fetch user profile
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setProfileUser({ id: userSnap.id, ...userSnap.data() });
        } else {
          setProfileUser(null);
        }

        // Fetch user's recent votes
        const votesQ = query(
          collection(db, 'votes'), 
          where('user_id', '==', userId)
        );
        const votesSnap = await getDocs(votesQ);
        
        const votesData = [];
        for (const voteDoc of votesSnap.docs) {
          const vote = voteDoc.data();
          // Fetch topic details for each vote
          const topicRef = doc(db, 'topics', vote.topic_id);
          const topicSnap = await getDoc(topicRef);
          if (topicSnap.exists()) {
            votesData.push({
              id: voteDoc.id,
              ...vote,
              topic: { id: topicSnap.id, ...topicSnap.data() }
            });
          }
        }
        
        // Sort in memory to avoid requiring a composite index
        votesData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        
        setUserVotes(votesData);

      } catch (error) {
        console.error('Error fetching user details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">用户不存在</h2>
        <button onClick={() => navigate(-1)} className="px-6 py-2 bg-indigo-600 text-white rounded-full">
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="flex items-center p-4 bg-white shadow-sm z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-4">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">用户详情</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {/* Profile Card */}
        <section className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-gray-100">
          <div className="flex flex-col items-center text-center">
            {profileUser.avatar_url ? (
              <img src={profileUser.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-indigo-50 mb-4" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-3xl mb-4">
                {profileUser.username?.charAt(0) || 'U'}
              </div>
            )}
            <h2 className="text-2xl font-bold text-gray-900">{profileUser.username || '匿名用户'}</h2>
            
            <div className="flex items-center mt-2 space-x-2 justify-center">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-sm font-semibold rounded-full border border-indigo-100">
                {profileUser.title || '初出茅庐'}
              </span>
              {profileUser.total_votes > 5 && (
                <span className="px-3 py-1 bg-rose-50 text-rose-600 text-sm font-semibold rounded-full border border-rose-100 flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-1" />
                  周末斗士
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center mt-8">
            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
              <Target className="w-6 h-6 mx-auto text-amber-500 mb-1" />
              <p className="text-2xl font-black text-gray-900">{profileUser.total_votes || 0}</p>
              <p className="text-xs font-bold text-orange-600 mt-1">总参与表态</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <Award className="w-6 h-6 mx-auto text-purple-500 mb-1" />
              <p className="text-2xl font-black text-gray-900">{profileUser.insight_score || 0}</p>
              <p className="text-xs font-bold text-indigo-600 mt-1">洞察力积分</p>
            </div>
          </div>
        </section>

        {/* Voting History */}
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-4 px-2">最近表态</h3>
          {userVotes.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500 border border-gray-100">
              该用户暂无表态记录
            </div>
          ) : (
            <div className="space-y-4">
              {userVotes.map((vote) => (
                <div key={vote.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                      {vote.topic.category || '争议话题'}
                    </span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                      vote.stance === 'AGREE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {vote.stance === 'AGREE' ? '赞同' : '反对'}
                    </span>
                  </div>
                  <p className="text-gray-800 font-medium text-sm line-clamp-2">
                    {vote.topic.statement}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
