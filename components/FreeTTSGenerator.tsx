import React, { useState, useRef, useEffect } from 'react';
import { uploadFile, cloneVoice, deleteVoice } from '../services/minimax';
import { FileAudio, Upload, Loader2, Play, Download, Trash2, Infinity, CheckCircle, AlertCircle, RefreshCw, List, PauseCircle, PlayCircle, Layers, Zap, Activity } from 'lucide-react';

interface FreeTTSGeneratorProps {
  apiKey: string; // Comma separated string from App.tsx
}

interface ChunkItem {
    id: number;
    text: string;
    status: 'idle' | 'processing' | 'success' | 'error';
    audioBuffer: AudioBuffer | null;
    errorMsg?: string;
    workerKey?: string; // The specific key masked that processed this
}

interface WorkerStatus {
    keyMask: string;
    status: 'idle' | 'busy';
    currentTask?: number; // chunk id
}

// Helper: Write WAV
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

export const FreeTTSGenerator: React.FC<FreeTTSGeneratorProps> = ({ apiKey }) => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [fullText, setFullText] = useState('');
  
  // Chunk State
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const stopSignalRef = useRef(false);
  
  // Worker Logic
  const chunkCursorRef = useRef(0);
  const [keyFileMap, setKeyFileMap] = useState<Record<string, number>>({});
  const [workerStatuses, setWorkerStatuses] = useState<WorkerStatus[]>([]);

  const [logs, setLogs] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const CHUNK_SIZE = 250; 

  // Derived keys
  const apiKeys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);

  // Initialize Worker Statuses when keys change
  useEffect(() => {
      setWorkerStatuses(apiKeys.map(k => ({
          keyMask: k.substring(0, 8) + '...',
          status: 'idle'
      })));
  }, [apiKey]);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReferenceFile(e.target.files[0]);
      setKeyFileMap({}); // Reset uploads
    }
  };

  const prepareChunks = () => {
    if (!fullText.trim()) return;
    
    // Split logic
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText];
    const newChunks: ChunkItem[] = [];
    let currentText = "";
    let idCounter = 0;

    const commitChunk = (txt: string) => {
        if(txt.trim()) {
            newChunks.push({
                id: idCounter++,
                text: txt.trim(),
                status: 'idle',
                audioBuffer: null
            });
        }
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
    setChunks(newChunks);
    addLog(`Text prepared: ${newChunks.length} chunks.`);
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

  const processQueue = async () => {
    if (!referenceFile) return;
    
    setIsProcessing(true);
    stopSignalRef.current = false;
    
    // Init Audio Context
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Reset cursor to the first non-success item
    const firstPending = chunks.findIndex(c => c.status !== 'success');
    chunkCursorRef.current = firstPending === -1 ? chunks.length : firstPending;

    addLog(`Starting with ${apiKeys.length} concurrent workers...`);

    // Define Worker
    const worker = async (key: string, workerId: number) => {
        const shortKey = key.substring(0, 8) + '...';
        const workerIndex = workerId - 1;

        while (!stopSignalRef.current) {
            // 1. Get Job (Atomic-ish get and increment)
            const myChunkIndex = chunkCursorRef.current;
            
            // Boundary check
            if (myChunkIndex >= chunks.length) break;

            // Increment for next worker
            chunkCursorRef.current++;

            const currentChunk = chunks[myChunkIndex];

            // Safety check: if somehow already processed
            if (currentChunk.status === 'success') continue;

            // Update UI: Worker Busy
            updateWorkerStatus(workerIndex, 'busy', myChunkIndex);

            // Update Status to Processing
            setChunks(prev => {
                const copy = [...prev];
                copy[myChunkIndex] = { ...copy[myChunkIndex], status: 'processing', workerKey: shortKey };
                return copy;
            });

            // 2. Prepare File ID for this Key
            let fileId = keyFileMap[key];
            if (!fileId) {
                try {
                    // addLog(`Worker ${workerId} (${shortKey}): Uploading file...`);
                    const uploadResp = await uploadFile(key, referenceFile, 'voice_clone');
                    fileId = uploadResp.file.file_id;
                    
                    // Update cache map locally for this run context, and state
                    setKeyFileMap(prev => ({...prev, [key]: fileId}));
                } catch (e: any) {
                    addLog(`Worker ${workerId} Upload Error: ${e.message}`);
                    setChunks(prev => {
                        const copy = [...prev];
                        copy[myChunkIndex] = { ...copy[myChunkIndex], status: 'error', errorMsg: "Upload Failed" };
                        return copy;
                    });
                    updateWorkerStatus(workerIndex, 'idle');
                    continue; // Skip this chunk, try next? Or break?
                }
            }

            // 3. Process the Chunk
            const tempVoiceId = `PV_${Date.now()}_${workerId}_${Math.random().toString(36).substring(7)}`;
            
            try {
                // Create
                const cloneResp = await cloneVoice(key, {
                    file_id: fileId,
                    voice_id: tempVoiceId,
                    text: currentChunk.text,
                    model: 'speech-2.6-hd',
                    language_boost: 'auto'
                });

                if (cloneResp.demo_audio) {
                    // Download
                    const audioResp = await fetch(cloneResp.demo_audio);
                    const arrayBuffer = await audioResp.arrayBuffer();
                    const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);

                    // Save
                    setChunks(prev => {
                        const copy = [...prev];
                        copy[myChunkIndex] = { ...copy[myChunkIndex], status: 'success', audioBuffer };
                        return copy;
                    });
                } else {
                    throw new Error("No audio link");
                }
            } catch (err: any) {
                let msg = err.message || "Error";
                if (msg.includes("1008")) msg = "Insufficient Balance";
                
                setChunks(prev => {
                    const copy = [...prev];
                    copy[myChunkIndex] = { ...copy[myChunkIndex], status: 'error', errorMsg: msg };
                    return copy;
                });
            } finally {
                // Delete
                try {
                    await deleteVoice(key, tempVoiceId, 'voice_cloning');
                } catch (e) { /* ignore cleanup error */ }
            }

            // Task Done, Worker Idle momentarily
            updateWorkerStatus(workerIndex, 'idle');
            
            // Small cooldown
            await new Promise(r => setTimeout(r, 200));
        }
        
        // Final idle
        updateWorkerStatus(workerIndex, 'idle');
    };

    try {
        await Promise.all(apiKeys.map((k, i) => worker(k, i + 1)));
        addLog("All workers finished.");
    } catch (e: any) {
        addLog(`System Error: ${e.message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const mergeAndDownload = () => {
    const completedChunks = chunks.filter(c => c.status === 'success' && c.audioBuffer);
    if (completedChunks.length === 0 || !audioContextRef.current) return;

    addLog(`Merging ${completedChunks.length} chunks...`);

    const totalLength = completedChunks.reduce((acc, c) => acc + (c.audioBuffer?.length || 0), 0);
    const resultBuffer = audioContextRef.current.createBuffer(1, totalLength, completedChunks[0].audioBuffer!.sampleRate);
    const channelData = resultBuffer.getChannelData(0);

    let offset = 0;
    for (const chunk of completedChunks) {
        if (chunk.audioBuffer) {
            channelData.set(chunk.audioBuffer.getChannelData(0), offset);
            offset += chunk.audioBuffer.length;
        }
    }

    const blob = writeWav(resultBuffer);
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged_preview_${Date.now()}.wav`;
    a.click();
    addLog("Merge complete. Downloading...");
  };

  const successCount = chunks.filter(c => c.status === 'success').length;
  const progressPercent = chunks.length > 0 ? (successCount / chunks.length) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in h-[calc(100vh-140px)]">
        {/* Left: Input */}
        <div className="flex flex-col space-y-4 h-full">
             <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-700/50 rounded-xl p-4 shrink-0">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <Infinity className="text-purple-400" size={20} />
                        <h2 className="text-lg font-bold text-white">Smart Preview Merger</h2>
                    </div>
                </div>
                <div className="mt-2 bg-black/20 rounded p-2 text-xs border border-white/10">
                    <div className="flex items-center gap-2 mb-2 text-gray-300">
                        <Activity size={12} className="text-blue-400"/> 
                        <span className="font-semibold">Active Workers: {workerStatuses.filter(w => w.status === 'busy').length} / {apiKeys.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {workerStatuses.map((w, i) => (
                            <div key={i} className="flex items-center justify-between bg-black/20 p-1.5 rounded">
                                <span className="font-mono text-[10px] text-gray-400">{w.keyMask}</span>
                                {w.status === 'busy' ? (
                                    <div className="flex items-center gap-1 text-[10px] text-blue-300">
                                        <Loader2 size={10} className="animate-spin" />
                                        Task #{w.currentTask !== undefined ? w.currentTask + 1 : '?'}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-gray-600">Idle</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shrink-0">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">1. Reference Voice</h3>
                <div className="flex items-center gap-3">
                    <div className="relative overflow-hidden">
                        <input 
                            type="file" 
                            accept=".mp3,.wav,.m4a"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        />
                         <button className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors">
                            <Upload size={14} /> {referenceFile ? "Change File" : "Upload File"}
                         </button>
                    </div>
                    {referenceFile && <span className="text-xs text-purple-300 truncate">{referenceFile.name}</span>}
                </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex-1 flex flex-col min-h-0">
                 <div className="flex justify-between items-center mb-2 shrink-0">
                     <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">2. Input Text</h3>
                     <button 
                        onClick={prepareChunks}
                        disabled={!fullText.trim()}
                        className="text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white px-3 py-1 rounded transition-colors"
                     >
                        Prepare Chunks
                     </button>
                 </div>
                 <textarea
                    className="flex-1 w-full bg-gray-900 p-3 text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500 rounded-lg text-sm font-mono leading-relaxed"
                    placeholder="Paste text here..."
                    value={fullText}
                    onChange={(e) => setFullText(e.target.value)}
                 />
            </div>
        </div>

        {/* Right: Processing */}
        <div className="flex flex-col space-y-4 h-full">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex-1 flex flex-col min-h-0 relative overflow-hidden">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <List size={14}/> 
                        Queue ({successCount}/{chunks.length})
                    </h3>
                    <div className="flex gap-2">
                         {isProcessing ? (
                             <button onClick={() => stopSignalRef.current = true} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                                 <PauseCircle size={14} /> Stop
                             </button>
                         ) : (
                             <button 
                                onClick={processQueue}
                                disabled={chunks.length === 0 || !referenceFile}
                                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                             >
                                 <PlayCircle size={14} /> {chunks.some(c => c.status === 'success') ? "Resume / Retry" : "Start Processing"}
                             </button>
                         )}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-gray-700 rounded-full w-full mb-3 shrink-0">
                    <div className="h-full bg-green-500 transition-all duration-300 rounded-full" style={{width: `${progressPercent}%`}}></div>
                </div>

                {/* Chunk List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar bg-gray-900/50 rounded-lg p-2">
                    {chunks.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
                            <List size={40} className="mb-2 opacity-20" />
                            <p>No chunks prepared yet.</p>
                        </div>
                    )}
                    {chunks.map(chunk => (
                        <div key={chunk.id} className={`p-2 rounded border text-xs flex items-center gap-3 ${
                            chunk.status === 'success' ? 'bg-green-900/10 border-green-900/30' :
                            chunk.status === 'processing' ? 'bg-blue-900/10 border-blue-900/30' :
                            chunk.status === 'error' ? 'bg-red-900/10 border-red-900/30' :
                            'bg-gray-800 border-gray-700'
                        }`}>
                            <div className="w-6 h-6 shrink-0 flex items-center justify-center font-mono text-gray-500">
                                {chunk.id + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-gray-300">{chunk.text}</p>
                                {chunk.errorMsg && <p className="text-red-400 text-[10px]">{chunk.errorMsg}</p>}
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                                {chunk.workerKey && <span className="text-[10px] text-gray-500 bg-gray-900 px-1 rounded">{chunk.workerKey}</span>}
                                {chunk.status === 'processing' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                                {chunk.status === 'success' && <CheckCircle size={14} className="text-green-500" />}
                                {chunk.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
                                {chunk.status === 'idle' && <div className="w-3 h-3 rounded-full bg-gray-700" />}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Logs & Actions */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 h-48 shrink-0 flex flex-col">
                <div className="flex justify-between items-center mb-2 shrink-0">
                     <h3 className="text-xs font-semibold text-gray-400 uppercase">Logs</h3>
                     <button 
                        onClick={mergeAndDownload}
                        disabled={successCount === 0}
                        className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                     >
                        <Download size={14} /> Download Merged ({successCount})
                     </button>
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-[10px] text-gray-400 bg-black/40 p-2 rounded custom-scrollbar">
                    {logs.map((log, i) => <div key={i} className="mb-0.5 border-b border-gray-800/30 pb-0.5">{log}</div>)}
                </div>
            </div>
        </div>
    </div>
  );
};