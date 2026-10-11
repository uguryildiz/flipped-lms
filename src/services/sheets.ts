import { getAccessToken, ensureAccessToken, clearAccessToken } from './auth';
import { AikenQuestion, QuizAnswer } from '../types';

export const QUESTIONS_SHEET_NAME = 'Sorular';
export const ANSWERS_SHEET_NAME = 'Cevaplar';

export const QUESTIONS_HEADERS = [
  'Ders Adı',
  'Öğrenci No',
  'Öğrenci Ad Soyad',
  'Konu',
  'Soru',
  'Seçenek A',
  'Seçenek B',
  'Seçenek C',
  'Seçenek D',
  'Seçenek E',
  'Doğru Cevap',
  'Seçilme Durumu',
  'Analiz Skoru',
  'Session Kodu',
];

export const ANSWERS_HEADERS = [
  'Session Kodu',
  'Ders Adı',
  'Konu',
  'Soru No',
  'Soru',
  'Öğrenci No',
  'Öğrenci Ad Soyad',
  'Verilen Cevap',
  'Doğru Cevap',
  'Durum',
  'Zaman Damgası',
];

export function extractSpreadsheetId(urlOrId: string): string {
  if (!urlOrId) return '';
  let trimmed = urlOrId.trim();
  // Strip surrounding quotes, angle brackets, parentheses, markdown
  trimmed = trimmed.replace(/^["'<(\[]+|["'>)\]]+$/g, '').trim();

  // If user pasted /d/e/ published link:
  if (trimmed.includes('/d/e/')) {
    throw new Error(
      'Yayınlanmış web sayfası bağlantısı (pubhtml) desteklenmemektedir. Lütfen Google Sheet düzenleme (edit) bağlantısını yapıştırınız.'
    );
  }

  // 1. Matches /d/<ID> in any URL format (including /spreadsheets/d/..., /spreadsheets/u/0/d/..., /file/d/...)
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9-_]{15,})/);
  if (matchD && matchD[1]) {
    return matchD[1];
  }

  // 2. Matches URL parameter id=<ID> or key=<ID>
  const matchParam = trimmed.match(/[?&](?:id|key)=([a-zA-Z0-9-_]{15,})/);
  if (matchParam && matchParam[1]) {
    return matchParam[1];
  }

  // 3. Matches standard /spreadsheets/d/<ID>
  const matchSpreadsheet = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/);
  if (matchSpreadsheet && matchSpreadsheet[1]) {
    return matchSpreadsheet[1];
  }

  // 4. Raw alphanumeric ID without path
  const cleanId = trimmed.split(/[/\\?#]/)[0].trim();
  if (/^[a-zA-Z0-9-_]{15,}$/.test(cleanId)) {
    return cleanId;
  }

  return cleanId || trimmed;
}

export async function updateValuesInSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  token?: string
): Promise<void> {
  const authToken = token || (await getAccessToken());
  if (!authToken) throw new Error('Google Sheets erişim anahtarı bulunamadı veya oturum süresi doldu.');

  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range, values }),
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      clearAccessToken();
    }
    if (res.status === 429) {
      throw new Error('Google Sheets API kota sınırı aşıldı (429 Too Many Requests). Lütfen bekleyiniz.');
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Google Sheet verisi güncellenirken hata oluştu.');
  }
}

export async function appendValuesToSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  token?: string
): Promise<void> {
  const authToken = token || (await getAccessToken());
  if (!authToken) throw new Error('Google Sheets erişim anahtarı bulunamadı veya oturum süresi doldu.');

  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        values,
      }),
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      clearAccessToken();
    }
    if (res.status === 429) {
      throw new Error('Google Sheets API kota sınırı aşıldı (429 Too Many Requests). Lütfen bekleyiniz.');
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Google Sheet verisi eklenirken hata oluştu.');
  }
}

export async function ensureSheetTabsAndHeaders(spreadsheetId: string, token?: string): Promise<void> {
  const authToken = token || (await getAccessToken());
  if (!authToken) throw new Error('Google Sheets erişim anahtarı bulunamadı veya oturum süresi doldu.');

  // Fetch sheet metadata
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  if (!metaRes.ok) {
    if (metaRes.status === 401) {
      clearAccessToken();
    }
    const err = await metaRes.json().catch(() => ({}));
    const errMsg = err.error?.message || '';
    if (metaRes.status === 403) {
      throw new Error(
        `Google Sheet yetki hatası (403): Bu e-tabloya erişim yetkiniz yok veya düzenleme izniniz bulunmuyor. Lütfen Google Drive üzerinden bu dosyanın paylaşım ve düzenleme yetkilerini kontrol ediniz.`
      );
    }
    if (metaRes.status === 404) {
      throw new Error(
        `Google Sheet bulunamadı (404): Belirtilen bağlantıda bir e-tablo bulunamadı. Lütfen URL / ID bilgisini kontrol ediniz.`
      );
    }
    throw new Error(errMsg || 'Google Sheet bilgisi alınamadı. Lütfen URL / ID bilgisini kontrol ediniz.');
  }

  const meta = await metaRes.json().catch(() => ({}));
  const sheets: { properties: { sheetId: number; title: string } }[] = meta.sheets || [];
  const hasQuestionsSheet = sheets.some((s) => s.properties?.title === QUESTIONS_SHEET_NAME);
  const hasAnswersSheet = sheets.some((s) => s.properties?.title === ANSWERS_SHEET_NAME);

  const requests: any[] = [];
  if (!hasQuestionsSheet) {
    requests.push({
      addSheet: {
        properties: {
          title: QUESTIONS_SHEET_NAME,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    });
  }
  if (!hasAnswersSheet) {
    requests.push({
      addSheet: {
        properties: {
          title: ANSWERS_SHEET_NAME,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    });
  }

  if (requests.length > 0) {
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!batchRes.ok) {
      const err = await batchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Gerekli sayfalar (Sorular/Cevaplar) Google Sheet içine eklenemedi.');
    }
  }

  // Ensure headers exist in Sorular using PUT (update)
  const qHeaderRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(QUESTIONS_SHEET_NAME + '!A1:Z1')}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  let needQHeaders = true;
  if (qHeaderRes.ok) {
    const qData = await qHeaderRes.json().catch(() => ({}));
    if (qData.values && qData.values.length > 0 && qData.values[0].length > 0) {
      needQHeaders = false;
    }
  }
  if (needQHeaders) {
    await updateValuesInSheet(spreadsheetId, `${QUESTIONS_SHEET_NAME}!A1`, [QUESTIONS_HEADERS], authToken);
  }

  // Ensure headers exist in Cevaplar using PUT (update)
  const aHeaderRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(ANSWERS_SHEET_NAME + '!A1:Z1')}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  let needAHeaders = true;
  if (aHeaderRes.ok) {
    const aData = await aHeaderRes.json().catch(() => ({}));
    if (aData.values && aData.values.length > 0 && aData.values[0].length > 0) {
      needAHeaders = false;
    }
  }
  if (needAHeaders) {
    await updateValuesInSheet(spreadsheetId, `${ANSWERS_SHEET_NAME}!A1`, [ANSWERS_HEADERS], authToken);
  }
}

export async function connectExistingSpreadsheet(
  inputUrlOrId: string,
  token?: string
): Promise<{ id: string; url: string; title: string }> {
  const authToken = token || (await getAccessToken()) || (await ensureAccessToken());
  if (!authToken) throw new Error('Google Sheets erişimi için önce Google ile yetkilendirme yapmalısınız.');

  const spreadsheetId = extractSpreadsheetId(inputUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Lütfen geçerli bir Google Sheet bağlantısı veya ID’si giriniz.');
  }

  // Ensure tabs and headers exist in this spreadsheet
  await ensureSheetTabsAndHeaders(spreadsheetId, authToken);

  // Get sheet title
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  let title = 'Bağlı Google Sheet';
  if (metaRes.ok) {
    const meta = await metaRes.json().catch(() => ({}));
    title = meta.properties?.title || title;
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { id: spreadsheetId, url, title };
}

export async function listUserSpreadsheets(token?: string): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const authToken = token || (await getAccessToken());
  if (!authToken) return [];

  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,modifiedTime)",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    if (!res.ok) {
      return [];
    }
    const data = await res.json().catch(() => ({}));
    return data.files || [];
  } catch {
    return [];
  }
}

export async function createQuizSpreadsheet(
  courseName: string,
  sessionCode: string,
  token?: string
): Promise<{ id: string; url: string }> {
  const authToken = token || (await getAccessToken()) || (await ensureAccessToken());
  if (!authToken) throw new Error('Google Sheets erişimi için önce Google ile yetkilendirme yapmalısınız.');

  const title = `Ders İçi Soru & Quiz - ${courseName} (${sessionCode})`;

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: QUESTIONS_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: ANSWERS_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) {
      clearAccessToken();
    }
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Google Sheet oluşturulamadı.');
  }

  const sheetData = await createRes.json().catch(() => ({}));
  const spreadsheetId = sheetData.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error('Google Sheet oluşturuldu fakat kimlik (ID) bilgisi alınamadı.');
  }
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write headers cleanly to both sheets via update (PUT)
  await updateValuesInSheet(spreadsheetId, `${QUESTIONS_SHEET_NAME}!A1`, [QUESTIONS_HEADERS], authToken);
  await updateValuesInSheet(spreadsheetId, `${ANSWERS_SHEET_NAME}!A1`, [ANSWERS_HEADERS], authToken);

  return { id: spreadsheetId, url: spreadsheetUrl };
}

export async function syncQuestionsToSheet(
  spreadsheetId: string,
  questions: AikenQuestion[],
  token?: string
): Promise<void> {
  if (questions.length === 0) return;

  const rows = questions.map((q) => [
    q.courseName,
    q.studentNo,
    q.studentName || '',
    q.topic,
    q.question,
    q.optionA,
    q.optionB,
    q.optionC,
    q.optionD,
    q.optionE,
    q.answer,
    q.selectionStatus,
    q.analysisScore,
    q.sessionCode,
  ]);

  // We append questions to the Questions sheet
  await appendValuesToSheet(spreadsheetId, `${QUESTIONS_SHEET_NAME}!A1`, rows, token);
}

export async function syncAllQuestionsWithUpdate(
  spreadsheetId: string,
  questions: AikenQuestion[],
  token?: string
): Promise<void> {
  if (questions.length === 0) return;

  const authToken = token || (await getAccessToken()) || (await ensureAccessToken());
  if (!authToken) throw new Error('Google Sheets erişim anahtarı bulunamadı.');

  // 1. Ensure sheet has tabs and headers
  await ensureSheetTabsAndHeaders(spreadsheetId, authToken);

  // 2. Fetch existing rows from Sorular tab
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(QUESTIONS_SHEET_NAME + '!A:Z')}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  let existingValues: (string | number)[][] = [];
  if (getRes.ok) {
    const data = await getRes.json().catch(() => ({}));
    existingValues = data.values || [];
  }

  // Ensure header row
  if (existingValues.length === 0) {
    existingValues = [QUESTIONS_HEADERS];
  }

  const currentSessionCode = questions[0]?.sessionCode;

  const mapQToRow = (q: AikenQuestion) => [
    q.courseName,
    q.studentNo,
    q.studentName || '',
    q.topic,
    q.question,
    q.optionA,
    q.optionB,
    q.optionC,
    q.optionD,
    q.optionE,
    q.answer,
    q.selectionStatus,
    q.analysisScore,
    q.sessionCode,
  ];

  if (currentSessionCode) {
    // Find column index for Session Kodu in existing sheet
    const headerRow = existingValues[0] || [];
    let sessionCodeIdx = headerRow.findIndex((h) =>
      String(h).toLowerCase().includes('session')
    );
    if (sessionCodeIdx === -1) {
      sessionCodeIdx = 13;
    }

    // Preserve other sessions' rows
    const otherSessionsRows = existingValues.filter((row, idx) => {
      if (idx === 0) return true; // keep header
      const rowSession = String(row[sessionCodeIdx] ?? row[12] ?? '').trim();
      return rowSession !== currentSessionCode.trim();
    });

    const currentSessionRows = questions.map(mapQToRow);
    const combinedRows = [...otherSessionsRows, ...currentSessionRows];

    // Clear existing values in tab to prevent ghost rows
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(QUESTIONS_SHEET_NAME + '!A:Z')}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    // Write back combined rows
    await updateValuesInSheet(spreadsheetId, `${QUESTIONS_SHEET_NAME}!A1`, combinedRows, authToken);
  } else {
    // Simple append
    const rows = questions.map(mapQToRow);
    await appendValuesToSheet(spreadsheetId, `${QUESTIONS_SHEET_NAME}!A1`, rows, authToken);
  }
}

export async function syncAnswerToSheet(
  spreadsheetId: string,
  answer: QuizAnswer,
  token?: string
): Promise<void> {
  const row = [
    answer.sessionCode,
    answer.courseName,
    answer.topic,
    `Soru ${answer.questionIndex + 1}`,
    answer.questionText,
    answer.studentNo,
    answer.studentName || '',
    answer.givenAnswer,
    answer.correctAnswer,
    answer.statusText,
    answer.timestamp,
  ];

  await appendValuesToSheet(spreadsheetId, `${ANSWERS_SHEET_NAME}!A1`, [row], token);
}

export async function syncAnswersBatchToSheet(
  spreadsheetId: string,
  answers: QuizAnswer[],
  token?: string
): Promise<void> {
  if (answers.length === 0) return;

  const authToken = token || (await getAccessToken());
  if (!authToken) return; // Silent return if not authenticated

  // Ensure Cevaplar tab and headers exist
  await ensureSheetTabsAndHeaders(spreadsheetId, authToken);

  // Fetch existing answers to avoid duplicate rows
  const existingRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(ANSWERS_SHEET_NAME + '!A:Z')}`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
    }
  );

  const existingSignatures = new Set<string>();
  if (existingRes.ok) {
    const data = await existingRes.json().catch(() => ({}));
    const rows: (string | number)[][] = data.values || [];
    for (const r of rows) {
      if (r && r.length >= 7) {
        existingSignatures.add(`${r[0]}_${r[3]}_${r[5]}_${r[10] || r[9]}`);
      }
    }
  }

  // Filter only answers not already in the sheet
  const newAnswers = answers.filter((ans) => {
    const sig = `${ans.sessionCode}_Soru ${ans.questionIndex + 1}_${ans.studentNo}_${ans.timestamp}`;
    return !existingSignatures.has(sig);
  });

  if (newAnswers.length === 0) {
    return;
  }

  const rows = newAnswers.map((answer) => [
    answer.sessionCode,
    answer.courseName,
    answer.topic,
    `Soru ${answer.questionIndex + 1}`,
    answer.questionText,
    answer.studentNo,
    answer.studentName || '',
    answer.givenAnswer,
    answer.correctAnswer,
    answer.statusText,
    answer.timestamp,
  ]);

  await appendValuesToSheet(spreadsheetId, `${ANSWERS_SHEET_NAME}!A1`, rows, authToken);
}
