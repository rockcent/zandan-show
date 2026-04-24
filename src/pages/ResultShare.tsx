import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Share2, ArrowLeft, Download, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { predictTopicSentiment } from '../services/geminiService';

export default function ResultShare() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [topic, setTopic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const posterRef = useRef<HTMLDivElement>(null);
  
  // Emotion tags
  const EMOTION_TAGS = ['离谱', '看透一切', '支持到底', '一针见血', '人间清醒'];
  const [selectedTag, setSelectedTag] = useState(EMOTION_TAGS[1]);

  // Get user's stance from navigation state
  const userStance = location.state?.stance || 'AGREE';

  useEffect(() => {
    if (!topicId) return;

    const topicRef = doc(db, 'topics', topicId);
    const unsubscribe = onSnapshot(topicRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTopic({ id: docSnap.id, ...data });
        
        // If no sentiment_prediction exists, generate one
        if (!data.sentiment_prediction && (data.agree_count > 0 || data.disagree_count > 0)) {
          try {
            const prediction = await predictTopicSentiment(data.statement, data.agree_count || 0, data.disagree_count || 0);
            await updateDoc(topicRef, { sentiment_prediction: prediction });
          } catch (error) {
            console.error("Error predicting sentiment:", error);
          }
        }
      } else {
        console.error("No such topic!");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [topicId]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: '赞弹秀 - 争议话题',
          text: `我对这个话题表态了：${topic?.statement}。你也来试试吧！`,
          url: window.location.href,
        });
      } catch (error) {
        console.error('Error sharing', error);
      }
    } else {
      alert('您的浏览器不支持原生分享功能，请复制链接分享。');
    }
  };

  const handleDownloadPoster = () => {
    // In a real app, use html2canvas or similar to capture the posterRef
    // For this prototype, we'll just alert
    alert('海报生成功能正在开发中，敬请期待！');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-500 mb-4">未找到相关话题</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 font-medium">返回首页</button>
      </div>
    );
  }

  const totalVotes = (topic.agree_count || 0) + (topic.disagree_count || 0);
  const agreePercentage = totalVotes === 0 ? 50 : Math.round(((topic.agree_count || 0) / totalVotes) * 100);
  const disagreePercentage = 100 - agreePercentage;

  // AI Mouthpiece logic
  const isMajority = (userStance === 'AGREE' && agreePercentage >= 50) || (userStance === 'DISAGREE' && disagreePercentage >= 50);
  const userPercentage = userStance === 'AGREE' ? agreePercentage : disagreePercentage;
  
  let aiCopy = "";
  if (isMajority) {
    aiCopy = `英雄所见略同，我和全网 ${userPercentage}% 的聪明人站在一起。`;
  } else {
    aiCopy = `真理往往掌握在像我这样的 ${userPercentage}% 的人手里。`;
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex items-center p-4 bg-white shadow-sm z-10">
        <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-800">情绪战报</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-6 flex flex-col space-y-8 overflow-y-auto">
        {/* Stat Bar Section */}
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center leading-relaxed">
            {topic.statement}
          </h2>
          
          {/* Sentiment Prediction */}
          {topic.sentiment_prediction && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex items-start gap-3"
            >
              <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-900 mb-1">AI 舆论预测</h3>
                <p className="text-sm text-indigo-800/80 leading-relaxed">
                  {topic.sentiment_prediction}
                </p>
              </div>
            </motion.div>
          )}
          <div className="space-y-4">
            <div className="flex justify-between text-sm font-medium mb-2">
              <span className="text-emerald-600">赞成 {agreePercentage}%</span>
              <span className="text-rose-600">反对 {disagreePercentage}%</span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden flex">
              <motion.div 
                initial={{ width: '50%' }}
                animate={{ width: `${agreePercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-emerald-500"
              />
              <motion.div 
                initial={{ width: '50%' }}
                animate={{ width: `${disagreePercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-rose-500"
              />
            </div>
            
            <p className="text-center text-xs text-gray-500 mt-4">
              共 {totalVotes} 人参与表态
            </p>
          </div>
        </section>

        {/* Emotion Tags Selection */}
        <section className="px-2">
          <p className="text-sm font-bold text-gray-700 mb-3">选择你的情绪标签：</p>
          <div className="flex flex-wrap gap-2">
            {EMOTION_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedTag === tag 
                    ? 'bg-indigo-600 text-white shadow-md scale-105' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>

        {/* Poster Canvas Preview */}
        <section className="flex-1 flex flex-col items-center">
          <div 
            ref={posterRef}
            className="w-full aspect-[4/5] bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl shadow-lg p-8 flex flex-col justify-between text-white relative overflow-hidden"
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-black opacity-20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>

            <div className="z-10">
              <div className="flex items-center space-x-3 mb-6">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-white/50" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {user?.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{user?.displayName || '匿名用户'}</p>
                  <p className="text-xs text-white/70">在「赞弹秀」发表了态度</p>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold leading-snug mb-4">
                "{topic.statement}"
              </h3>
              
              <div className="flex flex-wrap gap-2 mb-6">
                <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-sm font-semibold tracking-wider">
                  {isMajority ? '多数派' : '少数派'}
                </div>
                <div className="inline-block px-4 py-2 bg-indigo-500/40 backdrop-blur-md rounded-full text-sm font-semibold tracking-wider border border-white/20">
                  #{selectedTag}
                </div>
              </div>

              <div className="bg-black/20 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                <p className="text-white/90 font-medium italic">
                  "{aiCopy}"
                </p>
              </div>

              {topic.sentiment_prediction && (
                <div className="bg-indigo-900/40 rounded-2xl p-4 border border-indigo-500/30 backdrop-blur-sm mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">AI 预测</span>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed">
                    {topic.sentiment_prediction}
                  </p>
                </div>
              )}
            </div>

            <div className="z-10 flex items-end justify-between mt-8 pt-6 border-t border-white/20">
              <div>
                <p className="text-xs text-white/60 uppercase tracking-widest mb-1">ZanDan Show</p>
                <p className="text-sm font-bold">扫码参与表态</p>
              </div>
              <div className="w-16 h-16 bg-white rounded-xl p-1 flex items-center justify-center">
                {/* Placeholder for QR Code */}
                <div className="w-full h-full border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <span className="text-[10px] text-gray-400 font-bold">QR</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Action Buttons */}
      <footer className="p-6 bg-white border-t border-gray-100 flex space-x-4">
        <button
          onClick={handleDownloadPoster}
          className="flex-1 flex items-center justify-center py-3 px-4 bg-gray-100 text-gray-800 font-semibold rounded-2xl hover:bg-gray-200 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          保存海报
        </button>
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center py-3 px-4 bg-indigo-600 text-white font-semibold rounded-2xl hover:bg-indigo-700 shadow-md transition-colors"
        >
          <Share2 className="w-5 h-5 mr-2" />
          分享好友
        </button>
      </footer>
    </div>
  );
}
