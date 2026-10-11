import React, { useState } from 'react';
import { Lock, UserCheck, ArrowRight, AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { apiFetch, safeJson } from '../utils/api';

interface TeacherLoginProps {
  onSuccess: (teacherInfo: { registrationNo: string; title: string }) => void;
  onSwitchToStudent?: () => void;
}

export const TeacherLogin: React.FC<TeacherLoginProps> = ({ onSuccess, onSwitchToStudent }) => {
  const [registrationNo, setRegistrationNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!registrationNo.trim() || !password.trim()) {
      setErrorMsg('Lütfen sicil numarası ve şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNo: registrationNo.trim(),
          password: password.trim(),
        }),
      });

      const data = await safeJson<{ teacher?: { registrationNo: string; title: string }; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error || `Giriş başarısız (HTTP ${res.status}). Sunucu bağlantısını kontrol ediniz.`);
      }

      if (data?.teacher) {
        onSuccess(data.teacher);
      } else {
        throw new Error('Geçersiz sunucu yanıtı alındı.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 my-10 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80 flex flex-col gap-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-linear-to-tr from-indigo-600 to-indigo-800 text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg shadow-indigo-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Öğretmen Paneli Girişi</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            Soru havuzunu yönetmek, Gemini analizini başlatmak ve canlı quizi yönetmek için lütfen giriş yapınız.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2.5 animate-in shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sicil Numarası</span>
            </label>
            <input
              type="text"
              required
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
              placeholder="Örn: 1234"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl outline-hidden text-sm font-semibold transition-all text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
              <span>Şifre</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi giriniz"
                className="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl outline-hidden text-sm font-semibold transition-all text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-2xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 text-sm"
          >
            {isLoading ? (
              <span>Doğrulanıyor...</span>
            ) : (
              <>
                <span>Öğretmen Paneline Giriş Yap</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {onSwitchToStudent && (
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="text-xs text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              Öğrenci misiniz? Soru Yükleme ve Quize Git →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
