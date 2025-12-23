
import React, { useState, useEffect } from 'react';
import { generateSpeech, hexToBlob } from '../services/minimax';
import { MODELS, EMOTIONS, SOUND_EFFECTS, Voice } from '../types';
import { Play, Download, Loader2, Volume2, Settings2, Trash2, StopCircle, Sliders, MessageSquareQuote, RotateCw, ChevronRight, Mic, X, Globe } from 'lucide-react';
import { VoiceSelectorModal } from './VoiceSelectorModal';
import { SUPPORTED_LANGUAGES } from '../types';

interface TTSGeneratorProps {
  apiKey: string;
  voices: Voice[];
  onDeleteVoice: (id: string, type: 'voice_cloning' | 'voice_generation') => void;
  onRefreshVoices?: () => void;
  onUsageUpdate?: (chars: number) => void;
}

export const TTSGenerator: React.FC<TTSGeneratorProps> = ({ apiKey, voices, onDeleteVoice, onRefreshVoices, onUsageUpdate }) => {
  const [text, setText] = useState(() => localStorage.getItem('minimax_tts_text') || 'Chào mừng bạn đến với MiniMax Studio. Đây là bản demo chuyển đổi văn bản thành giọng nói AI chất lượng cao.');
  const [model, setModel] = useState(() => localStorage.getItem('minimax_tts_model') || 'speech-2.6-hd');
  const [selectedVoiceId, setSelectedVoiceId] = useState(() => localStorage.getItem('minimax_tts_voice_id') || '');
  
  const [speed, setSpeed] = useState(() => parseFloat(localStorage.getItem('minimax_tts_speed') || '1.0'));
  const [vol, setVol] = useState(() => parseFloat(localStorage.getItem('minimax_tts_vol') || '1.0'));
  const [pitch, setPitch] = useState(() => parseInt(localStorage.getItem('minimax_tts_pitch') || '0'));
  const [emotion, setEmotion] = useState(() => localStorage.getItem('minimax_tts_emotion') || '');
  
  const [modPitch, setModPitch] = useState(0); 
  const [modIntensity, setModIntensity] = useState(0); 
  const [modTimbre, setModTimbre] = useState(0); 
  const [soundEffect, setSoundEffect] = useState('');
  
  const [toneMappings, setToneMappings] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => localStorage.setItem('minimax_tts_text', text), [text]);
  useEffect(() => localStorage.setItem('minimax_tts_model', model), [model]);
  useEffect(() => localStorage.setItem('minimax_tts_voice_id', selectedVoiceId), [selectedVoiceId]);
  useEffect(() => localStorage.setItem('minimax_tts_speed', speed.toString()), [speed]);
  useEffect(() => localStorage.setItem('minimax_tts_vol', vol.toString()), [vol]);
  useEffect(() => localStorage.setItem('minimax_tts_pitch', pitch.toString()), [pitch]);
  useEffect(() => localStorage.setItem('minimax_tts_emotion', emotion), [emotion]);

  useEffect(() => {
    if (voices.length > 0) {
        if (!selectedVoiceId) {
            setSelectedVoiceId(voices[0].id);
        }
    }
  }, [voices, selectedVoiceId]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setError('');
    setAudioUrl(null);
    setAudioBlob(null);

    const tones = toneMappings.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes('/'));

    try {
      const resp = await generateSpeech(apiKey, {
        model,
        text,
        stream: false, 
        language_boost: 'auto',
        output_format: 'hex',
        voice_setting: {
          voice_id: selectedVoiceId,
          speed,
          vol,
          pitch,
          emotion: emotion || undefined,
        },
        audio_setting: {
          sample_rate: 32000,
          format: 'mp3',
          channel: 1,
          bitrate: 128000,
        },
        voice_modify: {
            pitch: modPitch,
            intensity: modIntensity,
            timbre: modTimbre,
            sound_effects: soundEffect || undefined,
        },
        pronunciation_dict: tones.length > 0 ? { tone: tones } : undefined
      });

      if (resp.data.audio) {
        const blob = hexToBlob(resp.data.audio, 'audio/mpeg');
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        if (onUsageUpdate) onUsageUpdate(resp.extra_info?.usage_characters || text.length);
      } else {
        throw new Error('Không nhận được dữ liệu âm thanh');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tạo âm thanh');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
    }
  };

  const handleDeleteCurrentVoice = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const voice = voices.find(v => v.id === selectedVoiceId);
    if (voice && (voice.type === 'voice_cloning' || voice.type === 'voice_generation')) {
      if (confirm(`Bạn có chắc chắn muốn xóa giọng nói "${voice.name}"? Hành động này không thể hoàn tác.`)) {
        setIsDeleting(true);
        try {
            await onDeleteVoice(voice.id, voice.type);
            const remaining = voices.filter(v => v.id !== voice.id);
            if(remaining.length > 0) setSelectedVoiceId(remaining[0].id);
        } finally {
            setIsDeleting(false);
        }
      }
    }
  };

  const currentVoice = voices.find(v => v.id === selectedVoiceId);
  const canDelete = currentVoice && (currentVoice.type === 'voice_cloning' || currentVoice.type === 'voice_generation');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative animate-in fade-in slide-in-from-bottom-4 duration-500">
      <VoiceSelectorModal 
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        voices={voices}
        selectedVoiceId={selectedVoiceId}
        onSelect={(id) => { setSelectedVoiceId(id); setIsVoiceModalOpen(false); }}
        apiKey={apiKey}
        onRefresh={onRefreshVoices}
      />

      <div className="lg:col-span-2 space-y-6">
        <div className="bg-[#1e293b] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[550px] transition-all hover:shadow-teal-500/5">
          <div className="p-5 border-b border-slate-800 bg-[#1e293b]/80 backdrop-blur flex justify-between items-center">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"></div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nội dung văn bản</h2>
             </div>
             <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-md font-mono">{text.length}/10.000 ký tự</span>
          </div>
          <textarea
            className="flex-1 w-full bg-[#0f172a] p-8 text-slate-100 resize-none focus:outline-none text-xl leading-relaxed placeholder:text-slate-700 custom-scrollbar"
            placeholder="Nhập nội dung bạn muốn chuyển sang giọng nói tại đây..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="p-6 border-t border-slate-800 bg-[#1e293b]/50 flex justify-end items-center gap-4">
            <button
                onClick={handleGenerate}
                disabled={isGenerating || !text.trim()}
                className={`
                    px-8 py-3.5 rounded-2xl font-bold flex items-center gap-3 shadow-xl transition-all active:scale-95
                    ${isGenerating || !text.trim() 
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white hover:shadow-teal-500/20'
                    }
                `}
            >
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Volume2 size={20} />}
                {isGenerating ? 'Đang tạo âm thanh...' : 'Chuyển Sang Giọng Nói'}
            </button>
          </div>
        </div>

        {error && (
            <div className="p-4 bg-rose-900/10 border border-rose-900/30 rounded-2xl text-rose-300 text-sm flex items-start gap-3 animate-in fade-in duration-300">
                <div className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">!</div>
                <div className="flex-1">
                    <span className="font-bold">Lỗi hệ thống:</span> {error}
                </div>
            </div>
        )}

        {audioUrl && (
            <div className="bg-[#1e293b] rounded-3xl border border-slate-800 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-6">
                     <h3 className="text-lg font-bold text-teal-400">Kết quả âm thanh</h3>
                     <a 
                        href={audioUrl} 
                        download={`minimax-audio-${Date.now()}.mp3`}
                        className="text-xs flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white transition-all font-semibold"
                     >
                        <Download size={14} /> Tải xuống MP3
                     </a>
                </div>
                
                <div className="bg-[#0f172a] rounded-2xl p-5 flex items-center gap-6 border border-slate-800">
                    <button 
                        onClick={handlePlayPause}
                        className="w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-500 flex items-center justify-center text-white transition-all shadow-lg active:scale-90 shrink-0"
                    >
                        {isPlaying ? <StopCircle size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <div className="flex-1">
                        <div className="h-1 bg-slate-800 rounded-full w-full relative overflow-hidden">
                             <div className={`absolute inset-y-0 left-0 bg-teal-500 w-1/3 transition-all duration-300 ${isPlaying ? 'animate-pulse' : 'opacity-30'}`}></div>
                        </div>
                        <div className="flex justify-between mt-2">
                             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Đang sẵn sàng</span>
                             <span className="text-[10px] text-slate-500 font-mono">MP3 • 128kbps</span>
                        </div>
                    </div>
                    <audio 
                        ref={audioRef} 
                        src={audioUrl} 
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden" 
                    />
                </div>
            </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-[#1e293b] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-160px)]">
             <div className="p-5 border-b border-slate-800 bg-[#1e293b]/80 backdrop-blur">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 size={16} className="text-teal-500" /> Cấu hình giọng nói
                </h2>
             </div>
             
             <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest">Mô hình AI</label>
                    <div className="relative">
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-slate-200 appearance-none focus:ring-1 focus:ring-teal-500 outline-none text-sm transition-all"
                        >
                            {MODELS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                         <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">
                            <ChevronRight size={16} className="rotate-90" />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Giọng nói đang chọn</label>
                        {onRefreshVoices && (
                            <button onClick={onRefreshVoices} className="text-slate-500 hover:text-teal-400 transition-colors" title="Cập nhật danh sách">
                                <RotateCw size={14} />
                            </button>
                        )}
                    </div>
                    
                    <div 
                        onClick={() => setIsVoiceModalOpen(true)}
                        className="bg-[#0f172a] border border-slate-700 rounded-2xl p-4 cursor-pointer hover:border-teal-500 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                                <Mic size={20} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{currentVoice?.name || 'Chọn một giọng nói'}</p>
                                <p className="text-[10px] text-slate-500 truncate font-medium">{currentVoice?.description || 'Chưa có mô tả'}</p>
                            </div>
                            <ChevronRight size={18} className="text-slate-600 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
                        </div>
                    </div>

                    {canDelete && (
                        <button 
                            onClick={handleDeleteCurrentVoice}
                            disabled={isDeleting}
                            className="text-[10px] text-rose-400 mt-3 flex items-center gap-1.5 hover:text-rose-300 disabled:opacity-50 ml-1 font-bold transition-colors"
                        >
                            {isDeleting ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12} />} 
                            {isDeleting ? 'Đang xóa...' : 'Xóa giọng nói này'}
                        </button>
                    )}
                </div>

                <div className="space-y-5 pt-4 border-t border-slate-800">
                    <h3 className="text-[10px] font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                        <Sliders size={14} className="text-teal-500" /> Tùy chỉnh âm điệu
                    </h3>
                    
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <label className="text-xs font-bold text-slate-400">Tốc độ</label>
                            <span className="text-xs font-mono text-teal-400 font-bold">{speed.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" min="0.5" max="2" step="0.1" 
                            value={speed} 
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                        />
                    </div>
                    
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <label className="text-xs font-bold text-slate-400">Âm lượng</label>
                            <span className="text-xs font-mono text-teal-400 font-bold">{vol.toFixed(1)}</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="10" step="0.1" 
                            value={vol} 
                            onChange={(e) => setVol(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                        />
                    </div>

                     <div className="space-y-1">
                        <div className="flex justify-between">
                            <label className="text-xs font-bold text-slate-400">Cao độ</label>
                            <span className="text-xs font-mono text-teal-400 font-bold">{pitch > 0 ? `+${pitch}` : pitch}</span>
                        </div>
                        <input 
                            type="range" min="-12" max="12" step="1" 
                            value={pitch} 
                            onChange={(e) => setPitch(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                    <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest">Cảm xúc</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setEmotion('')}
                            className={`px-3 py-2 text-xs rounded-xl border font-bold transition-all ${!emotion ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-500/10' : 'bg-[#0f172a] border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                        >
                            Mặc định
                        </button>
                        {EMOTIONS.map(e => (
                             <button
                                key={e.value}
                                onClick={() => setEmotion(e.value)}
                                className={`px-3 py-2 text-xs rounded-xl border font-bold transition-all ${emotion === e.value ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-500/10' : 'bg-[#0f172a] border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 py-3 border-b border-slate-800 hover:text-teal-400 transition-colors uppercase tracking-widest"
                >
                    <span className="flex items-center gap-2"><Sliders size={14} /> Chỉnh sửa giọng nói nâng cao</span>
                    <ChevronRight size={14} className={`transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} />
                </button>

                {showAdvanced && (
                    <div className="space-y-6 pt-2 animate-in slide-in-from-top-2 duration-300">
                         <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[11px] font-bold text-slate-400 italic">Trầm / Thanh</label>
                                <span className="text-[11px] font-mono text-teal-400">{modPitch}</span>
                            </div>
                            <input 
                                type="range" min="-100" max="100" step="1" 
                                value={modPitch} 
                                onChange={(e) => setModPitch(parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                            />
                        </div>
                         <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[11px] font-bold text-slate-400 italic">Mạnh / Nhẹ</label>
                                <span className="text-[11px] font-mono text-teal-400">{modIntensity}</span>
                            </div>
                            <input 
                                type="range" min="-100" max="100" step="1" 
                                value={modIntensity} 
                                onChange={(e) => setModIntensity(parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                            />
                        </div>
                         <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[11px] font-bold text-slate-400 italic">Mũi / Trong</label>
                                <span className="text-[11px] font-mono text-teal-400">{modTimbre}</span>
                            </div>
                            <input 
                                type="range" min="-100" max="100" step="1" 
                                value={modTimbre} 
                                onChange={(e) => setModTimbre(parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-teal-500"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest">Hiệu ứng âm thanh</label>
                            <div className="relative">
                                <select
                                    value={soundEffect}
                                    onChange={(e) => setSoundEffect(e.target.value)}
                                    className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-slate-200 appearance-none focus:ring-1 focus:ring-teal-500 outline-none text-sm"
                                >
                                    {SOUND_EFFECTS.map(se => (
                                        <option key={se.value} value={se.value}>{se.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquareQuote size={14}/> Quy tắc phát âm (Tone)
                             </label>
                             <textarea
                                value={toneMappings}
                                onChange={(e) => setToneMappings(e.target.value)}
                                placeholder="Ví dụ: AI/Trí tuệ nhân tạo (Mỗi dòng một quy tắc)"
                                className="w-full bg-[#0f172a] border border-slate-700 rounded-xl p-3 text-slate-200 text-xs h-24 focus:ring-1 focus:ring-teal-500 outline-none resize-none font-mono"
                             />
                        </div>
                    </div>
                )}
             </div>
        </div>
      </div>
    </div>
  );
};
