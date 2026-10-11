export interface ParsedAiken {
  topic?: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  answer: string;
  rawText: string;
  isValid: boolean;
  errors: string[];
}

export function parseSingleAiken(text: string, defaultTopic = ''): ParsedAiken {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const errors: string[] = [];
  let topic = defaultTopic;
  let questionStem = '';
  let optionA = '';
  let optionB = '';
  let optionC = '';
  let optionD = '';
  let optionE = '';
  let answer = '';

  const stemLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for KONU / TOPIC line (e.g. KONU: Mitoz Bölünme or TOPIC: Mitoz)
    const topicMatch = line.match(/^(?:KONU|Konu|TOPIC|Topic)\s*[:=]\s*(.+)$/i);
    if (topicMatch) {
      topic = topicMatch[1].trim();
      continue;
    }

    // Check for ANSWER line
    const answerMatch = line.match(/^(?:ANSWER|Answer|CEVAP|Cevap)\s*[:=]\s*([A-Ea-e])/i);
    if (answerMatch) {
      answer = answerMatch[1].toUpperCase();
      continue;
    }

    // Check for options A through E
    const optMatch = line.match(/^([A-Ea-e])[\.\)\-\:]\s*(.+)$/i);
    if (optMatch) {
      const letter = optMatch[1].toUpperCase();
      const content = optMatch[2].trim();
      if (letter === 'A') optionA = content;
      else if (letter === 'B') optionB = content;
      else if (letter === 'C') optionC = content;
      else if (letter === 'D') optionD = content;
      else if (letter === 'E') optionE = content;
      continue;
    }

    // If options haven't started yet, it belongs to the question stem
    if (!optionA && !optionB && !optionC && !optionD && !optionE) {
      stemLines.push(line);
    }
  }

  questionStem = stemLines.join(' ');

  if (!questionStem) {
    errors.push('Soru kökü bulunamadı.');
  }
  if (!optionA) errors.push('A seçeneği eksik.');
  if (!optionB) errors.push('B seçeneği eksik.');
  if (!optionC) errors.push('C seçeneği eksik.');
  if (!optionD) errors.push('D seçeneği eksik.');
  if (!optionE) errors.push('E seçeneği eksik (Soru 5 seçenekli olmalıdır).');
  if (!answer) {
    errors.push('Cevap satırı eksik (Örn: ANSWER: C veya CEVAP: C).');
  } else if (!['A', 'B', 'C', 'D', 'E'].includes(answer)) {
    errors.push('Belirtilen cevap A, B, C, D veya E harflerinden biri olmalıdır.');
  }

  return {
    topic: topic || undefined,
    question: questionStem,
    optionA,
    optionB,
    optionC,
    optionD,
    optionE,
    answer,
    rawText: text,
    isValid: errors.length === 0,
    errors,
  };
}

export function parseMultipleAiken(text: string, defaultTopic = ''): ParsedAiken[] {
  const rawLines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let currentBlockLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Check if this line signals a new question block:
    // 1) Explicit KONU / TOPIC tag while we already have an existing block with an ANSWER or options
    const isTopicTag = /^(?:KONU|Konu|TOPIC|Topic)\s*[:=]/i.test(line);
    const hasExistingContent = currentBlockLines.some(l => /^(?:ANSWER|Answer|CEVAP|Cevap)\s*[:=]/i.test(l));

    if (isTopicTag && hasExistingContent) {
      blocks.push(currentBlockLines.join('\n'));
      currentBlockLines = [line];
      continue;
    }

    // 2) Blank line after an ANSWER line also partitions questions cleanly
    if (line.length === 0) {
      if (hasExistingContent) {
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
        continue;
      }
    }

    if (line.length > 0) {
      currentBlockLines.push(line);
    }
  }

  if (currentBlockLines.length > 0) {
    blocks.push(currentBlockLines.join('\n'));
  }

  // Fallback to double newline split if block collection found nothing
  if (blocks.length === 0 && text.trim().length > 0) {
    const rawBlocks = text
      .split(/\n\s*\n+/)
      .map(b => b.trim())
      .filter(b => b.length > 0);
    return rawBlocks.map(b => parseSingleAiken(b, defaultTopic));
  }

  return blocks.map(b => parseSingleAiken(b, defaultTopic)).filter(p => p.question.length > 0 || p.rawText.length > 0);
}

export function formatToAiken(q: {
  topic?: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  answer: string;
}): string {
  const topicPrefix = q.topic ? `KONU: ${q.topic}\n` : '';
  return `${topicPrefix}${q.question}
A. ${q.optionA}
B. ${q.optionB}
C. ${q.optionC}
D. ${q.optionD}
E. ${q.optionE}
ANSWER: ${q.answer.toUpperCase()}`;
}

export const SAMPLE_AIKEN_QUESTIONS = [
  {
    topic: 'Mitoz Bölünme',
    aikenText: `Mitoz bölünmenin anafaz evresinde gerçekleşen en belirgin hücresel olay aşağıdakilerden hangisidir?
A. Çekirdek zarı ve çekirdekçik eriyerek kaybolur
B. Kardeş kromatitler sentromerlerinden ayrılarak zıt kutuplara çekilir
C. Kromozomlar hücrenin ekvatoral düzleminde tek sıra halinde dizilir
D. Sitoplazma boğumlanarak iki yeni hücre oluşturur
E. Sentrozomlar kendilerini eşleyerek kutuplara hareket eder
ANSWER: B`,
  },
  {
    topic: 'Mayoz Bölünme',
    aikenText: `Mayoz I profazında homolog kromozomlar arasında gerçekleşen krossing-over olayının temel önemi nedir?
A. Kromozom sayısını yarıya indirir
B. Genetik çeşitliliği ve yeni kombinasyonları artırır
C. Hücrenin bölünme hızını iki katına çıkarır
D. Sentrozom eşlenmesini sağlar
E. İğ ipliklerinin kinetokorlara bağlanmasını engeller
ANSWER: B`,
  },
];

export const SAMPLE_MULTI_AIKEN = `KONU: Mitoz Bölünme
Mitoz bölünmenin anafaz evresinde gerçekleşen en belirgin hücresel olay aşağıdakilerden hangisidir?
A. Çekirdek zarı ve çekirdekçik eriyerek kaybolur
B. Kardeş kromatitler sentromerlerinden ayrılarak zıt kutuplara çekilir
C. Kromozomlar hücrenin ekvatoral düzleminde tek sıra halinde dizilir
D. Sitoplazma boğumlanarak iki yeni hücre oluşturur
E. Sentrozomlar kendilerini eşleyerek kutuplara hareket eder
ANSWER: B

KONU: Mayoz Bölünme
Mayoz I profazında homolog kromozomlar arasında gerçekleşen krossing-over olayının temel önemi nedir?
A. Kromozom sayısını yarıya indirir
B. Genetik çeşitliliği ve yeni kombinasyonları artırır
C. Hücrenin bölünme hızını iki katına çıkarır
D. Sentrozom eşlenmesini sağlar
E. İğ ipliklerinin kinetokorlara bağlanmasını engeller
ANSWER: B

KONU: Hücre Organelleri
Aşağıdaki hücresel yapılardan hangisi hidrolitik enzimler içererek hücre içi sindirimde görev alır?
A. Ribozom
B. Mitokondri
C. Lizozom
D. Golgi cisimciği
E. Kloroplast
ANSWER: C`;


