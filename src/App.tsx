import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Users,
  HelpCircle,
  FileSpreadsheet,
  Sparkles,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentPortal } from './components/StudentPortal';
import { apiFetch, safeJson } from './utils/api';

export default function App() {
  const [activeTab, setActiveTabState] = useState<'teacher' | 'student'>(() => {
    try {
      const saved = localStorage.getItem('edu_active_tab');
      return saved === 'teacher' || saved === 'student' ? saved : 'teacher';
    } catch {
      return 'teacher';
    }
  });

  const setActiveTab = (tab: 'teacher' | 'student') => {
    try {
      localStorage.setItem('edu_active_tab', tab);
    } catch {}
    setActiveTabState(tab);
  };

  const [activeSessionCode, setActiveSessionCodeState] = useState<string>(() => {
    try {
      return localStorage.getItem('edu_active_session_code') || '';
    } catch {
      return '';
    }
  });

  const setActiveSessionCode = (code: string) => {
    setActiveSessionCodeState(code);
    try {
      if (code) {
        localStorage.setItem('edu_active_session_code', code);
      } else {
        localStorage.removeItem('edu_active_session_code');
      }
    } catch {}
  };

  // On mount: if no local session code, check if there is an active session on the server
  useEffect(() => {
    if (!activeSessionCode) {
      apiFetch('/api/sessions/latest')
        .then((res) => (res.ok ? safeJson<{ code?: string }>(res) : null))
        .then((data) => {
          if (data?.code) {
            setActiveSessionCode(data.code);
          }
        })
        .catch(() => {});
    }
  }, [activeSessionCode]);

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* GLOBAL NAVBAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center shadow-xs">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight block leading-tight">
                Ders İçi Soru & Quiz
              </span>
              <span className="text-[11px] text-slate-500 font-medium block leading-none">
                5 Seçenekli Soru • Google Gemini Analizi • Google Sheets
              </span>
            </div>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center gap-2">
            <div className="p-1 bg-slate-100 rounded-2xl flex items-center border border-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab('teacher')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'teacher'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/50'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span className="hidden sm:inline">Öğretmen Paneli</span>
                <span className="sm:hidden">Öğretmen</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('student')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'student'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/50'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Öğrenci Girişi</span>
                <span className="sm:hidden">Öğrenci</span>
              </button>
            </div>

            {/* Help / Guide Button */}
            <button
              type="button"
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
              title="Kullanım Rehberi & Bilgi"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main className="flex-1 py-6">
        {activeTab === 'teacher' ? (
          <TeacherDashboard
            activeSessionCode={activeSessionCode}
            onSessionCodeChange={(code) => setActiveSessionCode(code)}
            onSwitchToStudentView={(code) => {
              setActiveSessionCode(code);
              setActiveTab('student');
            }}
          />
        ) : (
          <StudentPortal
            initialSessionCode={activeSessionCode}
            onExit={() => setActiveTab('teacher')}
          />
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Google Workspace (Google Sheets API) & Google Gemini AI Destekli Sınıf İçi Soru ve Canlı Quiz Platformu
          </span>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>5 Seçenekli Soru Formu (A-E)</span>
            <span>•</span>
            <span>Gerçek Zamanlı Cevaplama</span>
          </div>
        </div>
      </footer>

      {/* HELP & DOCUMENTATION MODAL */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  ?
                </div>
                <h3 className="text-lg font-bold text-slate-900">Uygulama Kullanım Rehberi</h3>
              </div>
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 text-xs sm:text-sm text-slate-700 leading-relaxed">
              {/* 1. Step: Session Creation */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-indigo-700 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  1. Oturum Açma & 5 Haneli Kod
                </span>
                <p>
                  Öğretmen ders adını ve günün konu başlıklarını girerek bir oturum başlatır. Sistem otomatik olarak 5 haneli
                  benzersiz bir katılım kodu (Örn: <strong>12345</strong>) üretir. Öğrenciler bu kodu girerek oturuma dahil olur.
                </p>
              </div>

              {/* 2. Step: Question Form */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <span className="font-bold text-indigo-700 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  2. 5 Seçenekli Soru Yükleme
                </span>
                <p>
                  Öğrenciler o gün işlenen konulardan açılır liste ile konu seçerek 5 seçenekli (A, B, C, D, E) sorularını form arayüzü ile tek tek hazırlar ve sisteme yükler:
                </p>
                <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto">
                  Mitoz bölünmenin anafaz evresinde hangi olay gerçekleşir?
                  <br />
                  A. Kromatin iplikler yoğunlaşır
                  <br />
                  B. Kardeş kromatitler zıt kutuplara çekilir
                  <br />
                  C. Çekirdek zarı yeniden oluşur
                  <br />
                  D. Kromozomlar ekvatoral düzlemde dizilir
                  <br />
                  E. DNA replikasyonu gerçekleşir
                  <br />
                  ANSWER: B
                </div>
              </div>

              {/* 3. Step: Gemini Analysis */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-indigo-700 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  3. Google Gemini Pedagojik Analizi & Soru Seçimi
                </span>
                <p>
                  Soru toplama bittiğinde Google Gemini soruların dil bilgisi, çeldirici kalitesi ve bilimsel doğruluğunu
                  inceleyerek 0-100 arası bir analiz skoru verir. Öğretmenin belirlediği eşiğe göre sorular{' '}
                  <strong className="text-emerald-700">"Seçildi"</strong> veya{' '}
                  <strong className="text-slate-700">"Seçilmedi"</strong> olarak etiketlenir.
                </p>
              </div>

              {/* 4. Step: Live Quiz & Google Sheets */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="font-bold text-indigo-700 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  4. Canlı Quiz & Google Sheets "Sorular" & "Cevaplar" Sekmeleri
                </span>
                <p>
                  Seçilen sorular sınıfta canlı quiz olarak çözülür. Öğretmen gerçek zamanlı olarak öğrencilerin cevaplarını
                  (seçenek dağılım yüzdeleri, anlık gelen cevaplar) gözlemler.
                </p>
                <p className="pt-1">
                  Google Sheet belgesinde:
                  <br />• <strong>"Sorular"</strong> sekmesinde: Ders Adı, Öğrenci No, Konu, Soru, Seçenek A-E, Cevap, Seçilme
                  Durumu, Analiz Skoru, Session Kodu
                  <br />• <strong>"Cevaplar"</strong> sekmesinde: Session Kodu, Ders Adı, Konu, Soru No, Soru, Öğrenci No,
                  Verilen Cevap, Doğru Cevap, Durum, Zaman Damgası
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
