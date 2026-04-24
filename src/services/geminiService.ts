const API_KEY = process.env.VOLCANO_API_KEY || process.env.GEMINI_API_KEY;
const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = 'doubao-seed-2-0-pro-260215';

const FALLBACK_TOPICS = [
  { category: "科技伦理", statement: "AI 最终会让人类大规模失业", image_keyword: "robot", tags: ["科技伦理", "职场内卷", "未来趋势"] },
  { category: "社会公平", statement: "财富世袭比努力工作更决定人生上限", image_keyword: "mansion", tags: ["阶层财富", "社会公平", "职场内卷"] },
  { category: "婚恋观念", statement: "不婚不育是现代人最理性的自我保护", image_keyword: "wedding", tags: ["两性情感", "婚恋观念", "个人主义"] },
  { category: "职场生存", statement: "00后整顿职场纯属眼高手低的自我感动", image_keyword: "office", tags: ["职场内卷", "代际冲突", "社会公平"] },
  { category: "教育内卷", statement: "快乐教育本质上是阶层固化的帮凶", image_keyword: "classroom", tags: ["教育内卷", "阶层财富", "社会公平"] },
  { category: "消费主义", statement: "买奢侈品就是交智商税", image_keyword: "luxury", tags: ["消费主义", "阶层财富", "个人主义"] },
  { category: "网络暴力", statement: "键盘侠必须为自己的言论负刑事责任", image_keyword: "keyboard", tags: ["网络暴力", "道德审判", "社会公平"] },
  { category: "代际冲突", statement: "父母皆祸害，原生家庭决定一生", image_keyword: "family", tags: ["代际冲突", "两性情感", "个人主义"] },
  { category: "性别对立", statement: "彩礼制度是物化女性的落后糟粕", image_keyword: "money", tags: ["两性情感", "性别对立", "婚恋观念"] },
  { category: "动物保护", statement: "吃狗肉和吃猪肉在道德上没有本质区别", image_keyword: "animal", tags: ["动物保护", "道德审判", "科技伦理"] }
];

interface DoubaoMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function doubaoChat(messages: DoubaoMessage[], timeout = 30000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Doubao API error ' + response.status + ': ' + err);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function parseJsonResponse(text: string): any {
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(jsonStr);
}

export const generateTopics = async (rawContent: string) => {
  const systemInstruction = '你是一个敏锐且冷酷的社会话题提取引擎。你的唯一任务是将输入的文本转化为 3 个极致非黑即白的争议话题。\n必须严格遵守以下规则：\n1. 话题字数绝对不可超过 20 个中文字符。\n2. 话题必须适合用完全赞同或坚决反对来回答，拒绝中立描述。\n3. 切角必须分别对应：[利益冲突]、[道德审判]、[走向预测]。\n4. 强制要求为每个话题输出 2-3 个核心分类标签（如：职场内卷、科技伦理、两性情感、阶层财富、消费主义等高度概括的词汇，不带#号），存入 tags 数组字段。\n5. 除了生成 3 个话题，你必须为每一个话题生成 1 个用于图片搜索的英文关键词（赋给 image_keyword 字段）。\n规则：\n- 必须是纯英文，且只能是 1 到 2 个单词。\n- 必须是极其具体的视觉具象名词（例如：话题涉及教育内卷，关键词应为 classroom 或 exam；话题涉及阶层固化，关键词应为 luxury 或 beggar）。\n- 拒绝任何抽象概念词汇。\n6. 必须且只能输出合法的 JSON 数据，不要包含任何 Markdown 标记、代码块标记或额外的解释性文字。';

  const prompt = '请提取以下内容的争议话题：\n' + rawContent;

  try {
    const text = await doubaoChat([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt },
    ], 30000);

    if (!text) throw new Error('EMPTY_RESPONSE');

    const data = parseJsonResponse(text);
    return {
      summary: data.news_summary,
      topics: data.topics.map((t: any) => ({
        category: t.category,
        statement: t.statement,
        hook: t.hook,
        perspective_agree: t.perspective_agree,
        perspective_disagree: t.perspective_disagree,
        image_keyword: t.image_keyword,
        tags: t.tags || []
      }))
    };
  } catch (error: any) {
    console.error('Doubao API Error:', error.message);

    if (error.name === 'AbortError' || error.message === 'EMPTY_RESPONSE') {
      console.log('Using fallback topics due to timeout or parse error.');
      const shuffled = [...FALLBACK_TOPICS].sort(() => 0.5 - Math.random());
      return {
        summary: "热门争议话题",
        topics: shuffled.slice(0, 3)
      };
    }

    throw new Error('该内容过于火爆，AI 大脑烧机中，请换个新闻试试～');
  }
};

export const predictTopicSentiment = async (statement: string, agreeCount: number, disagreeCount: number) => {
  const systemInstruction = '你是一个敏锐的社会学和心理学分析引擎。你的任务是根据一个争议性话题的当前投票情况，预测其最终的舆论走向、潜在的社会影响或最终结论。\n必须严格遵守以下规则：\n1. 预测字数不可超过 50 个中文字符。\n2. 语言风格要犀利、一针见血，带有一定的预见性。\n3. 必须且只能输出合法的 JSON 数据。';

  const prompt = '话题：' + statement + '\n当前投票：赞同 ' + agreeCount + ' 票，反对 ' + disagreeCount + ' 票。\n请预测该话题的舆论走向或潜在结果。';

  try {
    const text = await doubaoChat([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt },
    ], 15000);

    if (!text) throw new Error('EMPTY_RESPONSE');

    const data = parseJsonResponse(text);
    return data.prediction;
  } catch (error: any) {
    console.error('Doubao API Error (predictTopicSentiment):', error.message);
    return "舆论仍在发酵，最终走向扑朔迷离...";
  }
};

export const generateTrendingTopics = async () => {
  const systemInstruction = '你是一个敏锐且冷酷的社会话题提取引擎。你的任务是搜索全网今天最热门的3个争议性新闻或社会热点，并将它们转化为 3 个极致非黑即白的争议话题。\n必须严格遵守以下规则：\n1. 话题字数绝对不可超过 20 个中文字符。\n2. 话题必须适合用完全赞同或坚决反对来回答，拒绝中立描述。\n3. 强制要求为每个话题输出 2-3 个核心分类标签（如：职场内卷、科技伦理、两性情感、阶层财富、消费主义等高度概括的词汇，不带#号），存入 tags 数组字段。\n4. 必须为每一个话题生成 1 个用于图片搜索的英文关键词（赋给 image_keyword 字段）。\n规则：\n- 必须是纯英文，且只能是 1 到 2 个单词。\n- 必须是极其具体的视觉具象名词。\n5. 必须且只能输出合法的 JSON 数据。';

  try {
    const text = await doubaoChat([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: '搜索今天全网（特别是中国）最热门的3个争议性新闻或社会热点，并生成3个用于投票的争议性话题。' },
    ], 45000);

    if (!text) throw new Error('EMPTY_RESPONSE');

    const data = parseJsonResponse(text);
    return {
      summary: data.news_summary,
      topics: data.topics.map((t: any) => ({
        category: t.category,
        statement: t.statement,
        hook: t.hook,
        perspective_agree: t.perspective_agree,
        perspective_disagree: t.perspective_disagree,
        image_keyword: t.image_keyword,
        tags: t.tags || []
      }))
    };
  } catch (error: any) {
    console.error('Doubao API Error:', error.message);

    if (error.name === 'AbortError') {
      console.log('Using fallback topics due to timeout.');
      const shuffled = [...FALLBACK_TOPICS].sort(() => 0.5 - Math.random());
      return {
        summary: "全网热门争议话题",
        topics: shuffled.slice(0, 3)
      };
    }

    throw new Error('该内容过于火爆，AI 大脑烧机中，请换个新闻试试～');
  }
};
