import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * 获取动态权重系数 K (K-Factor)
 * @param matchesPlayed 对局次数
 * @returns K-Factor
 */
function getKFactor(matchesPlayed: number): number {
  // 新手卡片（<30局）K=32，老卡片（>=30局）K=16
  return matchesPlayed < 30 ? 32 : 16;
}

/**
 * 计算预期胜率 (Expected Score)
 * @param ratingA 己方 Elo 积分
 * @param ratingB 对手 Elo 积分
 * @returns 预期胜率 (0 ~ 1)
 */
function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * 核心数学公式：计算双方对决后的新 Elo 积分
 */
export function calculateNewRatings(
  ratingA: number, matchesA: number,
  ratingB: number, matchesB: number,
  aWon: boolean
) {
  // 1. 计算预期胜率
  const expectedA = calculateExpectedScore(ratingA, ratingB);
  const expectedB = calculateExpectedScore(ratingB, ratingA);

  // 2. 设定实际结果 S (胜=1, 负=0)
  const scoreA = aWon ? 1 : 0;
  const scoreB = aWon ? 0 : 1;

  // 3. 获取动态 K-Factor
  const kA = getKFactor(matchesA);
  const kB = getKFactor(matchesB);

  // 4. 计算最新积分 R' = R + K * (S - E)
  const newRatingA = ratingA + kA * (scoreA - expectedA);
  const newRatingB = ratingB + kB * (scoreB - expectedB);

  return {
    // 通常 Elo 积分取整
    newRatingA: Math.round(newRatingA),
    newRatingB: Math.round(newRatingB)
  };
}

/**
 * 执行闭环：在 Firestore 中原子化更新 A 和 B 的 Elo 积分与对局数
 * @param collectionName 集合名称 (例如 'topics' 或 'cards')
 * @param winnerId 胜出卡片的 ID
 * @param loserId 失败卡片的 ID
 */
export async function recordDuelResult(collectionName: string, winnerId: string, loserId: string) {
  const winnerRef = doc(db, collectionName, winnerId);
  const loserRef = doc(db, collectionName, loserId);

  try {
    await runTransaction(db, async (transaction) => {
      // 1. 读取双方当前数据
      const winnerDoc = await transaction.get(winnerRef);
      const loserDoc = await transaction.get(loserRef);

      if (!winnerDoc.exists() || !loserDoc.exists()) {
        throw new Error("参与对决的卡片不存在！");
      }

      const winnerData = winnerDoc.data();
      const loserData = loserDoc.data();

      // 2. 获取当前积分与对局数（兼容旧数据，赋予初始默认值）
      const ratingWinner = winnerData.elo_rating ?? 1500;
      const matchesWinner = winnerData.matches_played ?? 0;

      const ratingLoser = loserData.elo_rating ?? 1500;
      const matchesLoser = loserData.matches_played ?? 0;

      // 3. 计算新积分 (传入 true 表示 A/Winner 获胜)
      const { newRatingA: newWinnerRating, newRatingB: newLoserRating } = calculateNewRatings(
        ratingWinner, matchesWinner,
        ratingLoser, matchesLoser,
        true 
      );

      // 4. 原子化更新数据库
      transaction.update(winnerRef, {
        elo_rating: newWinnerRating,
        matches_played: matchesWinner + 1
      });

      transaction.update(loserRef, {
        elo_rating: newLoserRating,
        matches_played: matchesLoser + 1
      });
    });

    console.log(`Elo 更新成功: 胜者(${winnerId}) 败者(${loserId})`);
  } catch (error) {
    console.error("Elo 积分更新失败:", error);
    throw error;
  }
}
