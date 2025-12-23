

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Voice } from '../types';
import { generateSpeech, hexToBlob } from '../services/minimax';
import { Search, X, Play, Pause, Bookmark, MoreVertical, Filter, Loader2, RotateCw, CheckCircle } from 'lucide-react';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: Voice[];
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  apiKey: string;
  onRefresh?: () => void;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  voices,
  selectedVoiceId,
  onSelect,
  apiKey,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'my_voices'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
        const current = voices.find(v => v.id === selectedVoiceId);
        if (current && (current.type === 'voice_cloning' || current.type === 'voice_generation')) {
            setActiveTab('my_voices');
        }
    }
  }, [isOpen, selectedVoiceId, voices]);

  useEffect(() => {
    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    };
  }, []);

  const filteredVoices = useMemo(() => {
    let list = voices;
    if (activeTab === 'library') {
      list = list.filter(v => v.type === 'system');
    } else {
      list = list.filter(v => v.type === 'voice_cloning' || v.type === 'voice_generation');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(v => 
        v.name.toLowerCase().includes(q) || 
        (v.description && v.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [voices, activeTab, searchQuery]);

  if (!isOpen) return null;

  const handlePlay = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    if (playingVoiceId === voiceId) {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setPlayingVoiceId(null);
        return;
    }
    if (audioRef.current) audioRef.current.pause();
    setLoadingVoiceId(voiceId);
    try {
        const resp = await generateSpeech(apiKey, {
            model: 'speech-2.6-turbo',
            text: "Xin chào, đây là bản nghe thử giọng nói của tôi.",
            stream: false,
            voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
            audio_setting: { sample_rate: 32000, format: 'mp3', channel: 1, bitrate: 128000 }
        });
        if (resp.data.audio) {
            const blob = hexToBlob(resp.data.audio, 'audio/mpeg');
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => { setPlayingVoiceId(null); URL.revokeObjectURL(url); };
            await audio.play();
            setPlayingVoiceId(voiceId);
        }
    } catch (err) {
        alert("Không thể tạo bản nghe thử cho giọng nói này.");
    } finally {
        setLoadingVoiceId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#000]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#1e293b] rounded-3xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col border border-slate-700 overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-[#1e293b]/50">
          <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-white">Thư viện Giọng nói</h3>
              {onRefresh && (
                  <button onClick={onRefresh} className="p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-full transition-all" title="Làm mới">
                      <RotateCw size={16} />
                  </button>
              )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex items-center px-8 pt-2 border-b border-slate-800 bg-[#1e293b]/30">
            <button
                onClick={() => setActiveTab('library')}
                className={`mr-8 pb-4 text-sm font-bold border-b-2 transition-all ${
                    activeTab === 'library' 
                    ? 'text-teal-400 border-teal-500' 
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
            >
                Hệ thống
            </button>
            <button
                onClick={() => setActiveTab('my_voices')}
                className={`mr-8 pb-4 text-sm font-bold border-b-2 transition-all ${
                    activeTab === 'my_voices' 
                    ? 'text-teal-400 border-teal-500' 
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
            >
                Của tôi
            </button>
        </div>

        <div className="p-6 pb-2 bg-[#1e293b]/20">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="text" 
                        placeholder="Tìm kiếm giọng nói..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                    />
                </div>
                <button className="px-5 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 flex items-center gap-2 text-sm font-bold transition-all">
                    <Filter size={16} /> Bộ lọc
                </button>
            </div>
            
            <div className="flex gap-2 mt-4 overflow-x-auto pb-4 scrollbar-hide">
                <span onClick={() => setSearchQuery('Nữ')} className="px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-400 whitespace-nowrap cursor-pointer hover:bg-teal-500/10 hover:text-teal-400 hover:border-teal-500/50 transition-all">
                    Giọng Nữ
                </span>
                <span onClick={() => setSearchQuery('Nam')} className="px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-400 whitespace-nowrap cursor-pointer hover:bg-teal-500/10 hover:text-teal-400 hover:border-teal-500/50 transition-all">
                    Giọng Nam
                </span>
                <span onClick={() => setSearchQuery('Tiếng Việt')} className="px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-400 whitespace-nowrap cursor-pointer hover:bg-teal-500/10 hover:text-teal-400 hover:border-teal-500/50 transition-all">
                    Tiếng Việt
                </span>
                <span onClick={() => setSearchQuery('')} className="px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-[11px] font-bold text-slate-500 whitespace-nowrap cursor-pointer hover:text-slate-300 transition-all">
                    Xóa tất cả
                </span>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#0f172a]/20">
            {filteredVoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-600">
                    <p className="font-medium">Không tìm thấy giọng nói nào phù hợp.</p>
                    {activeTab === 'my_voices' && (
                        <p className="text-xs mt-2 italic text-slate-500">Bạn có thể tạo giọng nói mới trong tab Nhân Bản Giọng Nói.</p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredVoices.map((voice) => (
                        <div 
                            key={voice.id}
                            className={`group flex items-center p-4 rounded-2xl border transition-all cursor-pointer ${
                                selectedVoiceId === voice.id 
                                ? 'bg-teal-500/5 border-teal-500/50 shadow-lg shadow-teal-500/5' 
                                : 'bg-[#1e293b] border-slate-700 hover:border-slate-600'
                            }`}
                            onClick={() => onSelect(voice.id)}
                        >
                            <div 
                                className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shrink-0 mr-4 cursor-pointer overflow-hidden shadow-md group-hover:scale-105 transition-all" 
                                onClick={(e) => handlePlay(e, voice.id)}
                            >
                                {loadingVoiceId === voice.id ? (
                                    <Loader2 size={24} className="text-teal-400 animate-spin" />
                                ) : playingVoiceId === voice.id ? (
                                    <Pause size={24} className="text-teal-400" fill="currentColor" />
                                ) : (
                                    <Play size={24} className="text-slate-400 group-hover:text-white ml-1 transition-colors" fill="currentColor" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0 mr-3">
                                <div className="flex items-center gap-2">
                                    <h4 className={`text-sm font-bold truncate ${selectedVoiceId === voice.id ? 'text-teal-300' : 'text-slate-200'}`}>
                                        {voice.name}
                                    </h4>
                                    {voice.type !== 'system' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 font-bold uppercase">
                                            Tùy chỉnh
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-500 truncate mt-1 font-medium italic">
                                    {voice.description || 'Chưa có thông tin mô tả'}
                                </p>
                            </div>

                            <div className="shrink-0">
                                {selectedVoiceId === voice.id ? (
                                    <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center shadow-lg shadow-teal-500/20 animate-in zoom-in duration-300">
                                        <CheckCircle size={16} className="text-white" />
                                    </div>
                                ) : (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onSelect(voice.id); }}
                                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        Chọn
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
