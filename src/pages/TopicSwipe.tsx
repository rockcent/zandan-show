import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, runTransaction, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, ThumbsDown, Loader2, ArrowLeft, Share2 } from 'lucide-react';

export default function TopicSwipe() {
  const { newsId } = useParams<{ newsId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [topics, setTopics] = useState<any[]>([]);
  const [newsSummary, setNewsSummary] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [comboCount, setComboCount] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const fetchTopics = async () => {
      if (!newsId) return;
      try {
        const newsDoc = await getDoc(doc(db, 'newsItems', newsId));
        if (newsDoc.exists()) {
          setNewsSummary(newsDoc.data().summary || '');
        }

        const q = query(collection(db, 'topics'), where('news_id', '==', newsId));
        const querySnapshot = await getDocs(q);
        const fetchedTopics = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTopics(fetchedTopics);
      } catch (error) {
        console.error('Error fetching topics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTopics();
  }, [newsId]);

  const handleVote = async (stance: 'AGREE' | 'DISAGREE') => {
    if (!user || currentIndex >= topics.length) return;

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    const currentTopic = topics[currentIndex];
    const topicRef = doc(db, 'topics', currentTopic.id);
    const userRef = doc(db, 'users', user.uid);

    setSwipeDirection(stance === 'AGREE' ? 'right' : 'left');

    try {
      // 0. Check for Shadowban
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().status === 'BANNED') {
        // Shadowban: Fake success
        console.log("Vote recorded (shadowban).");
        
        let newCombo = comboCount + 1;
        
        // Fake Combo Effect
        setComboCount(newCombo);
        if (newCombo % 10 === 0) {
          setShowCombo(true);
          setTimeout(() => setShowCombo(false), 1500);
        }
      } else {
        // 1. Record the vote
        await addDoc(collection(db, 'votes'), {
          user_id: user.uid,
          topic_id: currentTopic.id,
          stance: stance,
          createdAt: serverTimestamp(),
        });

        // 2. Update topic counts and user total_votes
        await runTransaction(db, async (transaction) => {
          const topicDoc = await transaction.get(topicRef);
          const userDoc = await transaction.get(userRef);

          if (!topicDoc.exists() || !userDoc.exists()) {
            throw new Error("Document does not exist!");
          }

          const newAgreeCount = (topicDoc.data().agree_count || 0) + (stance === 'AGREE' ? 1 : 0);
          const newDisagreeCount = (topicDoc.data().disagree_count || 0) + (stance === 'DISAGREE' ? 1 : 0);
          const newTotalVotes = (userDoc.data().total_votes || 0) + 1;

          const totalTopicVotes = newAgreeCount + newDisagreeCount;
          const agreeRatio = totalTopicVotes > 0 ? newAgreeCount / totalTopicVotes : 0.5;
          const controversyScore = (1 - 2 * Math.abs(agreeRatio - 0.5)) * Math.log10(totalTopicVotes + 1);

          let newInsightScore = (userDoc.data().insight_score || 0) + 2;
          let newCombo = comboCount + 1;
          if (newCombo % 10 === 0) {
            newInsightScore += 20; // Bonus points for 10 combo
          }

          transaction.update(topicRef, {
            agree_count: newAgreeCount,
            disagree_count: newDisagreeCount,
            controversy_score: controversyScore
          });

          transaction.update(userRef, {
            total_votes: newTotalVotes,
            insight_score: newInsightScore,
          });
        });

        // Handle Combo Effect
        const newCombo = comboCount + 1;
        setComboCount(newCombo);
        if (newCombo % 10 === 0) {
          setShowCombo(true);
          setTimeout(() => setShowCombo(false), 1500);
        }
      }

      // Delay slightly for swipe animation to finish
      setTimeout(() => {
        setSwipeDirection(null);
        // Move to next card
        if (currentIndex < topics.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          // Navigate to result of the last topic voted, passing the stance
          navigate(`/result/${currentTopic.id}`, { state: { stance } });
        }
      }, 300);

    } catch (error) {
      console.error('Error voting:', error);
      alert('Failed to submit vote. Please try again.');
    }
  };

  const handleShare = async (topic: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareData = {
      title: '争议话题：' + topic.statement,
      text: `快来参与这个争议话题的讨论：${topic.statement}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
        alert('链接已复制到剪贴板，快去分享给好友吧！');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-500 mb-4">未找到相关话题</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 font-medium">返回首页</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-900 text-white relative overflow-hidden">
      {/* Header */}
      <header className="flex items-center p-6 z-10">
        <button onClick={() => navigate('/')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center font-medium text-white/80">
          话题 {currentIndex + 1} / {topics.length}
        </div>
        <div className="w-10"></div> {/* Spacer */}
      </header>

      {/* Card Stack */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 relative">
        <AnimatePresence mode="popLayout">
          {topics.map((topic, index) => {
            if (index < currentIndex) return null;
            
            const isCurrent = index === currentIndex;
            const isNext = index === currentIndex + 1;

            return (
              <motion.div
                key={topic.id}
                drag={isCurrent ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={(e, info) => {
                  if (info.offset.x > 100) {
                    handleVote('AGREE');
                  } else if (info.offset.x < -100) {
                    handleVote('DISAGREE');
                  }
                }}
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ 
                  scale: isCurrent ? 1 : 0.95, 
                  y: isCurrent ? 0 : 20, 
                  opacity: isCurrent ? 1 : (isNext ? 0.5 : 0),
                  zIndex: topics.length - index
                }}
                exit={{ 
                  x: swipeDirection === 'right' ? 300 : (swipeDirection === 'left' ? -300 : 0), 
                  opacity: 0, 
                  rotate: swipeDirection === 'right' ? 10 : (swipeDirection === 'left' ? -10 : 0) 
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`absolute w-full max-w-sm aspect-[3/4] bg-white rounded-3xl shadow-2xl p-8 flex flex-col justify-center items-center text-center border border-gray-100 ${isCurrent ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {isCurrent && (
                  <div className="absolute top-8 w-full flex justify-between px-8 pointer-events-none opacity-50">
                    <span className="text-rose-500 font-bold text-xl border-2 border-rose-500 rounded-md px-2 transform -rotate-12">左滑反对</span>
                    <span className="text-emerald-500 font-bold text-xl border-2 border-emerald-500 rounded-md px-2 transform rotate-12">右滑赞同</span>
                  </div>
                )}
                <div className="text-sm font-bold text-indigo-500 mb-2 tracking-widest uppercase">{topic.category || '争议话题'}</div>
                {newsSummary && <div className="text-xs text-gray-400 mb-6 px-4 py-1 bg-gray-50 rounded-full">{newsSummary}</div>}
                <h2 className="text-2xl font-bold text-gray-900 leading-relaxed mb-6">
                  {topic.statement}
                </h2>
                <button
                  onClick={(e) => handleShare(topic, e)}
                  className="absolute bottom-6 right-6 p-3 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors shadow-sm"
                  title="分享"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </main>

      {/* Combo Animation Overlay */}
      <AnimatePresence>
        {showCombo && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1.2, opacity: 1, rotate: 0 }}
            exit={{ scale: 2, opacity: 0, filter: "blur(10px)" }}
            transition={{ type: "spring", bounce: 0.6 }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-300 to-orange-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] italic tracking-tighter">
                COMBO
              </h1>
              <p className="text-5xl font-black text-white drop-shadow-lg mt-2">x{comboCount}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <footer className="p-8 z-10 flex justify-center space-x-8">
        <button
          onClick={() => handleVote('DISAGREE')}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-rose-50 hover:scale-105 active:scale-95 transition-all group"
        >
          <ThumbsDown className="w-10 h-10 text-rose-500 group-hover:text-rose-600" />
        </button>
        <button
          onClick={() => handleVote('AGREE')}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all group"
        >
          <ThumbsUp className="w-10 h-10 text-emerald-500 group-hover:text-emerald-600" />
        </button>
      </footer>

      {/* Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-rose-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      </div>
    </div>
  );
}
