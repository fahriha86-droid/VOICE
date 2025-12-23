import React, { useState, useRef, useEffect, useMemo } from 'react';
import { uploadFile, cloneVoice, deleteVoice } from '../services/minimax';
import { Upload, Loader2, Play, Download, Trash2, Users, FileAudio, PlayCircle, PauseCircle, List, CheckCircle, AlertCircle, RefreshCw, Wand2, Music, Lock, Unlock, Volume2, Activity, Zap, Info } from 'lucide-react';

interface ConversationGeneratorProps {
  apiKey: string; // Comma separated
}

// Define a palette for speakers
const SPEAKER_COLORS = [
    { name: 'indigo', border: 'border-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400', badge: 'bg-indigo-500/20' },
    { name: 'emerald', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500/20' },
    { name: 'amber', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20' },
    { name: 'pink', border: 'border-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400', badge: 'bg-pink-500/20' },
    { name: 'cyan', border: 'border-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-500/20' },
    { name: 'rose', border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-400', badge: 'bg-rose-500/20' },
    { name: 'violet', border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', badge: 'bg-violet-500/20' },
    { name: 'orange', border: 'border-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/20' },
];

interface Speaker {
    name: string;
    file: File | null;
    previewUrl?: string;
    previewStatus: 'idle' | 'loading' | 'generated' | 'confirmed';
    colorIdx: number; // Index in SPEAKER_COLORS
}

interface Segment {
    id: number;
    originalLineId: number; // To track which script line this belongs to
    partIndex: number;      // 0, 1, 2...
    totalParts: number;     // Total parts for this line
    speaker: string;
    text: string;
    status: 'idle' | 'processing' | 'success' | 'error';
    detailedStatus?: string; 
    audioBuffer: AudioBuffer | null;
    errorMsg?: string;
    workerKey?: string;
}

interface WorkerStatus {
    keyMask: string;
    status: 'idle' | 'busy';
    currentTask?: number; // Segment ID
}

const CHUNK_SIZE = 250; // Smaller chunk size for better visibility

// --- Helpers ---

const writeWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;
  
    function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length
  
    for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  
    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); 
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; 
        view.setInt16(pos, sample, true); 
        pos += 2;
      }
      offset++; 
    }
    return new Blob([bufferArr], { type: "audio/wav" });
};

// Returns an array of strings
const smartSplitText = (fullText: string): string[] => {
    if (fullText.length <= CHUNK_SIZE) return [fullText];

    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText];
    const chunks: string[] = [];
    let currentText = "";

    const commitChunk = (txt: string) => {
        if(txt.trim()) chunks.push(txt.trim());
    };

    for (const sentence of sentences) {
        if (sentence.length > CHUNK_SIZE) {
             if(currentText) { commitChunk(currentText); currentText = ""; }
             let remaining = sentence;
             while (remaining.length > 0) {
                 let slice = remaining.slice(0, CHUNK_SIZE);
                 if (remaining.length > CHUNK_SIZE) {
                     const lastSpace = slice.lastIndexOf(' ');
                     if (lastSpace > CHUNK_SIZE / 2) slice = slice.slice(0, lastSpace);
                 }
                 commitChunk(slice.trim());
                 remaining = remaining.slice(slice.length).trim();
             }
        } else {
            if ((currentText + " " + sentence).length <= CHUNK_SIZE) {
                currentText += (currentText ? " " : "") + sentence;
            } else {
                commitChunk(currentText);
                currentText = sentence;
            }
        }
    }
    commitChunk(currentText);
    return chunks;
};


export const ConversationGenerator: React.FC<ConversationGeneratorProps> = ({ apiKey }) => {
    const [script, setScript] = useState('');
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    
    // Flattened segments (Chunked)
    const [segments, setSegments] = useState<Segment[]>([]);
    
    const [pauseDuration, setPauseDuration] = useState(500); // ms
    
    // Processing State
    const [isProcessing, setIsProcessing] = useState(false);
    const stopSignalRef = useRef(false);
    const chunkCursorRef = useRef(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [workerStatuses, setWorkerStatuses] = useState<WorkerStatus[]>([]);
    
    // Merged Result State
    const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
    const [mergedUrl, setMergedUrl] = useState<string | null>(null);

    // Cache: Map [ApiKey][SpeakerName] = FileID
    const [keySpeakerFileMap, setKeySpeakerFileMap] = useState<Record<string, Record<string, number>>>({});

    const audioContextRef = useRef<AudioContext | null>(null);

    const apiKeys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);

    useEffect(() => {
        setWorkerStatuses(apiKeys.map(k => ({
            keyMask: k.substring(0, 8) + '...',
            status: 'idle'
        })));
    }, [apiKey]);

    // Parse Script and Split into Segments immediately
    useEffect(() => {
        const lines = script.split('\n');
        const uniqueSpeakers = new Set<string>();
        const newSegments: Segment[] = [];
        let segmentIdCounter = 0;
        let lineIdCounter = 0;

        lines.forEach((line, lineIdx) => {
            if(!line.trim()) return;
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const speakerName = line.substring(0, colonIndex).trim();
                const text = line.substring(colonIndex + 1).trim();
                
                if (speakerName && text) {
                    uniqueSpeakers.add(speakerName);
                    
                    // Split text immediately here
                    const chunks = smartSplitText(text);
                    chunks.forEach((chunkText, partIdx) => {
                        newSegments.push({
                            id: segmentIdCounter++,
                            originalLineId: lineIdCounter,
                            partIndex: partIdx,
                            totalParts: chunks.length,
                            speaker: speakerName,
                            text: chunkText,
                            status: 'idle',
                            audioBuffer: null
                        });
                    });
                    lineIdCounter++;
                }
            }
        });

        // Update Speakers List
        setSpeakers(prev => {
            const next: Speaker[] = [];
            let colorCounter = 0;
            uniqueSpeakers.forEach(name => {
                const existing = prev.find(p => p.name === name);
                if (existing) {
                    next.push(existing);
                } else {
                    const nextColorIdx = (prev.length + colorCounter) % SPEAKER_COLORS.length;
                    next.push({ 
                        name, 
                        file: null, 
                        previewStatus: 'idle',
                        colorIdx: nextColorIdx
                    });
                }
                colorCounter++;
            });
            return next;
        });

        // Optimization: Try to keep status of existing segments if text matches
        setSegments(prev => {
             // Simple diff: if length matches and text matches, keep the state
             if (prev.length === newSegments.length && prev.every((p, i) => p.text === newSegments[i].text && p.speaker === newSegments[i].speaker)) {
                 return prev;
             }
             return newSegments;
        });

    }, [script]);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const handleSpeakerFileChange = (speakerName: string, file: File) => {
        setSpeakers(prev => prev.map(s => s.name === speakerName ? { ...s, file, previewStatus: 'idle', previewUrl: undefined } : s));
        setKeySpeakerFileMap(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => {
                if (next[key][speakerName]) delete next[key][speakerName];
            });
            return next;
        });
    };

    const updateWorkerStatus = (index: number, status: 'idle' | 'busy', taskId?: number) => {
        setWorkerStatuses(prev => {
            const next = [...prev];
            if(next[index]) {
              next[index] = { ...next[index], status, currentTask: taskId };
            }
            return next;
        });
    };

    // --- PREVIEW LOGIC ---
    const generatePreview = async (speakerName: string) => {
        const speaker = speakers.find(s => s.name === speakerName);
        if (!speaker || !speaker.file) return;

        const firstSegment = segments.find(s => s.speaker === speakerName);
        const textToPreview = firstSegment ? firstSegment.text.substring(0, 150) : "Hello, this is a preview of my voice.";

        setSpeakers(prev => prev.map(s => s.name === speakerName ? { ...s, previewStatus: 'loading' } : s));
        addLog(`Generating preview for ${speakerName}...`);

        try {
            const key = apiKeys[0]; 
            let fileId = keySpeakerFileMap[key]?.[speakerName];
            if (!fileId) {
                const uploadResp = await uploadFile(key, speaker.file, 'voice_clone');
                fileId = uploadResp.file.file_id;
                setKeySpeakerFileMap(prev => ({
                    ...prev,
                    [key]: { ...(prev[key] || {}), [speakerName]: fileId! }
                }));
            }

            const tempVoiceId = `PREVIEW_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const cloneResp = await cloneVoice(key, {
                file_id: fileId,
                voice_id: tempVoiceId,
                text: textToPreview,
                model: 'speech-2.6-hd',
                language_boost: 'auto'
            });

            if (cloneResp.demo_audio) {
                setSpeakers(prev => prev.map(s => s.name === speakerName ? { 
                    ...s, 
                    previewStatus: 'generated',
                    previewUrl: cloneResp.demo_audio 
                } : s));
                addLog(`Preview ready for ${speakerName}`);
            }

            try { await deleteVoice(key, tempVoiceId, 'voice_cloning'); } catch(e){}

        } catch (err: any) {
             addLog(`Preview Error for ${speakerName}: ${err.message}`);
             setSpeakers(prev => prev.map(s => s.name === speakerName ? { ...s, previewStatus: 'idle' } : s));
             alert(`Preview failed: ${err.message}`);
        }
    };

    const confirmSpeaker = (speakerName: string) => {
        setSpeakers(prev => prev.map(s => s.name === speakerName ? { ...s, previewStatus: 'confirmed' } : s));
    };

    const unlockSpeaker = (speakerName: string) => {
        setSpeakers(prev => prev.map(s => s.name === speakerName ? { ...s, previewStatus: 'generated' } : s));
    };

    // --- MAIN GENERATION LOGIC ---

    const processQueue = async () => {
        const missingFiles = speakers.filter(s => !s.file);
        if (missingFiles.length > 0) {
            alert(`Please upload voice files for: ${missingFiles.map(s => s.name).join(', ')}`);
            return;
        }

        // Auto-confirm if users press start without confirming manually
        setSpeakers(prev => prev.map(s => s.file ? { ...s, previewStatus: 'confirmed' } : s));

        if (segments.length === 0) return;

        setIsProcessing(true);
        stopSignalRef.current = false;
        setMergedUrl(null); 
        
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        // Reset cursor to start or first pending
        const firstPending = segments.findIndex(c => c.status !== 'success');
        chunkCursorRef.current = firstPending === -1 ? 0 : firstPending;

        addLog(`Starting processing with ${apiKeys.length} threads...`);

        const worker = async (key: string, workerId: number) => {
            const shortKey = key.substring(0, 8) + '...';
            const workerIndex = workerId - 1;

            while (!stopSignalRef.current) {
                // Get next task atomically
                const myIdx = chunkCursorRef.current;
                
                // End condition
                if (myIdx >= segments.length) break;
                
                // Increment for next worker
                chunkCursorRef.current++;

                const segment = segments[myIdx];
                
                // Skip if done
                if (segment.status === 'success') continue;

                updateWorkerStatus(workerIndex, 'busy', myIdx);
                
                // Update UI: Start
                setSegments(prev => {
                    const copy = [...prev];
                    copy[myIdx] = { 
                        ...copy[myIdx], 
                        status: 'processing', 
                        workerKey: shortKey,
                        detailedStatus: `Starting part ${segment.partIndex + 1}/${segment.totalParts}...`
                    };
                    return copy;
                });

                const speakerObj = speakers.find(s => s.name === segment.speaker);
                // Safety check
                if (!speakerObj || !speakerObj.file) {
                     setSegments(prev => {
                        const copy = [...prev];
                        copy[myIdx] = { ...copy[myIdx], status: 'error', errorMsg: "Missing File" };
                        return copy;
                    });
                    updateWorkerStatus(workerIndex, 'idle');
                    continue;
                }

                // 1. Upload/Get File ID
                let fileId: number | undefined = keySpeakerFileMap[key]?.[segment.speaker];
                if (!fileId) {
                    try {
                        setSegments(prev => {
                            const copy = [...prev];
                            copy[myIdx].detailedStatus = "Uploading Voice...";
                            return copy;
                        });
                        
                        const uploadResp = await uploadFile(key, speakerObj.file, 'voice_clone');
                        fileId = uploadResp.file.file_id;
                        setKeySpeakerFileMap(prev => ({
                            ...prev,
                            [key]: { ...(prev[key] || {}), [segment.speaker]: fileId! }
                        }));
                    } catch (e: any) {
                        setSegments(prev => {
                            const copy = [...prev];
                            copy[myIdx] = { ...copy[myIdx], status: 'error', errorMsg: "Upload Failed" };
                            return copy;
                        });
                        updateWorkerStatus(workerIndex, 'idle');
                        continue;
                    }
                }

                // 2. Generate
                setSegments(prev => {
                    const copy = [...prev];
                    copy[myIdx].detailedStatus = "Synthesizing...";
                    return copy;
                });

                const tempVoiceId = `C_${Date.now()}_${workerId}_${myIdx}_${Math.random().toString(36).substring(7)}`;

                try {
                    const cloneResp = await cloneVoice(key, {
                        file_id: fileId!,
                        voice_id: tempVoiceId,
                        text: segment.text, // Text is already chunked!
                        model: 'speech-2.6-hd',
                        language_boost: 'auto'
                    });

                    if (cloneResp.demo_audio) {
                        const audioResp = await fetch(cloneResp.demo_audio);
                        const arrayBuffer = await audioResp.arrayBuffer();
                        const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
                        
                        setSegments(prev => {
                            const copy = [...prev];
                            copy[myIdx] = { 
                                ...copy[myIdx], 
                                status: 'success', 
                                audioBuffer: audioBuffer,
                                detailedStatus: "Done"
                            };
                            return copy;
                        });
                    } else {
                        throw new Error("No audio returned");
                    }
                } catch (err: any) {
                    let msg = err.message || "API Error";
                    if (msg.includes("1008")) msg = "Insufficient Balance";
                    setSegments(prev => {
                        const copy = [...prev];
                        copy[myIdx] = { 
                            ...copy[myIdx], 
                            status: 'error', 
                            errorMsg: msg,
                            detailedStatus: "Failed"
                        };
                        return copy;
                    });
                } finally {
                    try { await deleteVoice(key, tempVoiceId, 'voice_cloning'); } catch (e) { /* ignore */ }
                }

                updateWorkerStatus(workerIndex, 'idle');
                // Small delay to prevent rate limits from firing too aggressively if many short texts
                await new Promise(r => setTimeout(r, 100));
            }
            updateWorkerStatus(workerIndex, 'idle');
        };

        try {
            await Promise.all(apiKeys.map((k, i) => worker(k, i + 1)));
            addLog("Queue processing finished.");
        } catch (e: any) {
            addLog(`System Error: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleMerge = () => {
        const completedSegments = segments.filter(s => s.status === 'success' && s.audioBuffer);
        if (completedSegments.length === 0 || !audioContextRef.current) return;

        addLog(`Merging ${completedSegments.length} segments...`);

        const sampleRate = completedSegments[0].audioBuffer!.sampleRate;
        const pauseLength = Math.floor((pauseDuration / 1000) * sampleRate);
        
        let totalLength = 0;
        
        // Calculate length
        for (let i = 0; i < completedSegments.length; i++) {
             totalLength += completedSegments[i].audioBuffer!.length;
             // Add pause if next segment exists AND (different speaker OR different original line)
             if (i < completedSegments.length - 1) {
                 const curr = completedSegments[i];
                 const next = completedSegments[i+1];
                 
                 // If different speaker, always pause
                 if (curr.speaker !== next.speaker) {
                     totalLength += pauseLength;
                 } 
                 // If same speaker but different script line (new paragraph), pause
                 else if (curr.originalLineId !== next.originalLineId) {
                     totalLength += pauseLength;
                 }
                 // If same speaker and same line (chunk split), NO pause (stitching)
             }
        }

        const resultBuffer = audioContextRef.current.createBuffer(1, totalLength, sampleRate);
        const channelData = resultBuffer.getChannelData(0);

        let offset = 0;
        for (let i = 0; i < completedSegments.length; i++) {
            const curr = completedSegments[i];
            
            // Append audio
            channelData.set(curr.audioBuffer!.getChannelData(0), offset);
            offset += curr.audioBuffer!.length;

            // Append pause logic
            if (i < completedSegments.length - 1) {
                const next = completedSegments[i+1];
                if (curr.speaker !== next.speaker || curr.originalLineId !== next.originalLineId) {
                    offset += pauseLength;
                }
            }
        }

        const blob = writeWav(resultBuffer);
        const url = URL.createObjectURL(blob);
        setMergedBlob(blob);
        setMergedUrl(url);
        addLog("Merge complete. Ready to download.");
    };

    const successCount = segments.filter(s => s.status === 'success').length;
    const progress = segments.length > 0 ? (successCount / segments.length) * 100 : 0;
    
    // Check if we can start
    const canStart = speakers.length > 0 && segments.length > 0 && speakers.every(s => s.file);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in h-[calc(100vh-140px)]">
            {/* Left: Script & Speakers */}
            <div className="flex flex-col space-y-4 h-full">
                <div className="bg-gradient-to-r from-indigo-900/50 to-cyan-900/50 border border-indigo-700/50 rounded-xl p-4 shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="text-indigo-400" size={20} />
                        <h2 className="text-lg font-bold text-white">Conversation Generator (Smart Mode)</h2>
                    </div>
                    <p className="text-xs text-gray-300">
                        1. Paste script.
                        2. Upload reference audio.
                        3. <strong>Click Start Generation</strong>.
                    </p>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shrink-0 flex flex-col min-h-[150px] max-h-[30%]">
                    <div className="flex justify-between items-center mb-2">
                         <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">1. Script Input</h3>
                    </div>
                    <textarea 
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                        placeholder={`Host: Welcome to the show!\nGuest: Thanks for having me.`}
                        className="flex-1 w-full bg-gray-900 p-3 text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm font-mono leading-relaxed"
                    />
                </div>

                {speakers.length > 0 && (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shrink-0 flex-1 overflow-y-auto">
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">2. Assign Voices</h3>
                             <span className="text-[10px] text-gray-500">
                                 {speakers.length} Speakers Detected
                             </span>
                        </div>
                        
                        <div className="space-y-3">
                            {speakers.map((s, i) => {
                                const color = SPEAKER_COLORS[s.colorIdx];
                                return (
                                <div key={i} className={`bg-gray-900 p-3 rounded-lg border transition-all ${s.file ? 'border-green-800' : 'border-gray-700'} relative overflow-hidden`}>
                                    {/* Color Indicator Strip */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${color.bg.replace('/10', '')} opacity-80`}></div>

                                    {/* Header Row */}
                                    <div className="flex items-center justify-between mb-2 pl-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-full ${color.badge} ${color.text} flex items-center justify-center text-xs font-bold border ${color.border.replace('border-', 'border-opacity-30 ')}`}>
                                                {s.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className={`text-sm font-bold ${color.text}`}>{s.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s.file ? (
                                                <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                                                    {s.file.name}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-red-400 flex items-center gap-1">
                                                    <AlertCircle size={10} /> No File
                                                </span>
                                            )}
                                            
                                            <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px] text-white">
                                                {s.file ? "Change" : "Upload"}
                                                <input type="file" accept="audio/*" className="hidden" onChange={(e) => {
                                                    if(e.target.files?.[0]) handleSpeakerFileChange(s.name, e.target.files[0]);
                                                }} />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Preview Actions Area */}
                                    <div className="flex items-center gap-3 mt-2 bg-black/20 p-2 rounded ml-2">
                                        {/* State: No File */}
                                        {!s.file && <span className="text-[10px] text-gray-500 italic">Upload audio to enable generation.</span>}

                                        {/* State: File Present */}
                                        {s.file && (
                                            <div className="flex items-center gap-2 w-full">
                                                <button 
                                                    onClick={() => generatePreview(s.name)}
                                                    disabled={s.previewStatus === 'loading'}
                                                    className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1 rounded text-[10px] flex items-center gap-2"
                                                >
                                                    {s.previewStatus === 'loading' ? <Loader2 size={10} className="animate-spin" /> : <Volume2 size={10} />}
                                                    Test Voice
                                                </button>
                                                {s.previewUrl && <audio src={s.previewUrl} controls className="h-5 w-24 opacity-60" />}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Right: Queue & Process */}
            <div className="flex flex-col space-y-4 h-full">
                {/* Active Workers Panel */}
                <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-700/30 rounded-xl p-3 shrink-0">
                     <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-white">
                            <Activity size={16} className="text-purple-400"/>
                            <h3 className="text-xs font-bold uppercase tracking-wider">Active Workers ({apiKeys.length} Threads)</h3>
                        </div>
                        <span className="text-[10px] text-gray-400">Processing in parallel</span>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        {workerStatuses.map((w, i) => (
                            <div key={i} className="flex items-center justify-between bg-black/40 p-1.5 rounded border border-white/5">
                                <span className="font-mono text-[10px] text-gray-500">{w.keyMask}</span>
                                {w.status === 'busy' ? (
                                    <div className="flex items-center gap-1 text-[10px] text-blue-300">
                                        <Loader2 size={10} className="animate-spin" />
                                        Task #{w.currentTask !== undefined ? w.currentTask + 1 : '?'}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-gray-600 flex items-center gap-1"><Zap size={10}/> Idle</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex-1 flex flex-col min-h-0 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                         <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <List size={14}/> 
                            Dialogue Queue ({successCount}/{segments.length})
                        </h3>
                        <div className="flex gap-2">
                             {isProcessing ? (
                                 <button onClick={() => stopSignalRef.current = true} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                                     <PauseCircle size={14} /> Stop
                                 </button>
                             ) : (
                                 <button 
                                    onClick={processQueue}
                                    disabled={!canStart}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors
                                        ${canStart ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                                    `}
                                 >
                                     <PlayCircle size={14} /> 
                                     Start Generation
                                 </button>
                             )}
                        </div>
                    </div>

                    <div className="h-1 bg-gray-700 rounded-full w-full mb-3 shrink-0">
                        <div className="h-full bg-green-500 transition-all duration-300 rounded-full" style={{width: `${progress}%`}}></div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar bg-gray-900/50 rounded-lg p-2">
                        {segments.map(seg => {
                            const speaker = speakers.find(s => s.name === seg.speaker);
                            const color = speaker ? SPEAKER_COLORS[speaker.colorIdx] : SPEAKER_COLORS[0];
                            
                            return (
                            <div key={seg.id} className={`p-2 rounded border text-xs flex items-center gap-3 relative overflow-hidden ${
                                seg.status === 'success' ? `${color.bg} ${color.border} border-opacity-50` :
                                seg.status === 'processing' ? 'bg-gray-800 border-blue-500 border-opacity-50 animate-pulse' :
                                seg.status === 'error' ? 'bg-red-900/10 border-red-800' :
                                'bg-gray-800 border-gray-700'
                            }`}>
                                <div className={`w-24 shrink-0 font-bold truncate ${color.text} flex flex-col`}>
                                    <span>{seg.speaker}</span>
                                    <span className="text-[9px] text-gray-500 font-normal">
                                        {seg.totalParts > 1 ? `Part ${seg.partIndex + 1}/${seg.totalParts}` : `Full Line`}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-gray-300">{seg.text}</p>
                                    
                                    {/* Detailed Status Row */}
                                    <div className="flex items-center gap-2 mt-1 h-3">
                                        {seg.status === 'processing' && (
                                            <span className="text-[9px] text-blue-300 flex items-center gap-1">
                                                <Loader2 size={8} className="animate-spin" /> {seg.detailedStatus || 'Processing...'}
                                            </span>
                                        )}
                                        {seg.status === 'error' && (
                                             <span className="text-[9px] text-red-400">{seg.errorMsg || seg.detailedStatus || 'Error'}</span>
                                        )}
                                        {seg.status === 'success' && (
                                             <span className="text-[9px] text-green-500 flex items-center gap-1">
                                                 <CheckCircle size={8} /> Ready
                                             </span>
                                        )}
                                    </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                    {seg.workerKey && <span className="text-[9px] text-gray-500 bg-black/40 px-1 rounded font-mono">{seg.workerKey}</span>}
                                    {seg.status === 'processing' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                                    {seg.status === 'success' && <CheckCircle size={14} className="text-green-500" />}
                                </div>
                            </div>
                        )})}
                        {segments.length === 0 && <div className="text-center text-gray-500 mt-10">Paste a script to detect speakers and segments.</div>}
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 h-auto shrink-0 flex flex-col gap-3">
                     <div className="flex items-center gap-4">
                         <div className="flex-1">
                             <label className="text-xs text-gray-400 block mb-1">Pause between speakers/paragraphs (ms)</label>
                             <input 
                                type="number" 
                                value={pauseDuration} 
                                onChange={(e) => setPauseDuration(Number(e.target.value))}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                             />
                         </div>
                         <button 
                            onClick={handleMerge}
                            disabled={successCount === 0 || isProcessing}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors h-full mt-auto"
                         >
                            <Wand2 size={16} /> Merge Audio
                         </button>
                         {mergedUrl && (
                             <a 
                                href={mergedUrl} 
                                download={`conversation_complete_${Date.now()}.wav`}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors h-full mt-auto"
                             >
                                <Download size={16} /> Download Result
                             </a>
                         )}
                     </div>
                     <div className="h-24 overflow-y-auto font-mono text-[10px] text-gray-400 bg-black/40 p-2 rounded custom-scrollbar border border-gray-700">
                        {logs.map((log, i) => <div key={i} className="mb-0.5 border-b border-gray-800/30 pb-0.5">{log}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};