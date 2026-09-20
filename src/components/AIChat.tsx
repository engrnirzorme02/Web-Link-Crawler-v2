import React, { useState, useRef, useEffect } from 'react';
import { Session, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Send, Bot, User, Copy, CheckCircle2, AlertCircle, Sparkles, Loader2, Trash2, ChevronDown, Download, CheckSquare, Square, FileJson, FileText, File, Volume2, SquareSquare, Mic, Settings2, X, Upload } from 'lucide-react';
import { cn, truncateForFirestore } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { ApiUsageMonitor } from './ApiUsageMonitor';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  grounding?: { index: number, vertexUrl: string, realUrl: string, title?: string }[];
}

interface AIChatProps {
  session: Session | null;
  allSessions?: Session[];
  userId: string | null;
  onSessionCreated?: (id: string) => void;
}

const availableContexts = [
  { id: 'crawler', label: 'Crawler' },
  { id: 'smart_crawler', label: 'Smart Crawler' },
  { id: 'extractor', label: 'Extractor' },
  { id: 'url_processor', label: 'Processor' },
  { id: 'bulk', label: 'Fetch' },
];

export function AIChat({ session, allSessions = [], userId, onSessionCreated }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
const [speakingId, setSpeakingId] = useState<string | null>(null);
  
  // Voice Settings
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [speechRate, setSpeechRate] = useState(1);
  const [speechPitch, setSpeechPitch] = useState(1);

  // Dictation
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      setSelectedVoiceURI(currentUri => {
        if (currentUri && currentUri.toLowerCase().includes('zephyr')) return currentUri;
        const zephyr = availableVoices.find(v => v.name.toLowerCase().includes('zephyr'));
        if (zephyr) return zephyr.voiceURI;
        if (currentUri && availableVoices.some(v => v.voiceURI === currentUri)) return currentUri;
        return availableVoices.length > 0 ? availableVoices[0].voiceURI : '';
      });
    };
    
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    
    // Init speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
        }
      };
      
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleDictation = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setAttachedFiles(prev => [...prev, { name: file.name, content: text }]);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };
  
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([]);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [useDeepResearch, setUseDeepResearch] = useState(false);
  const [expertMode, setExpertMode] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Cycling status messages for Deep Research
  const deepResearchStatuses = [
    "Initializing research agents...",
    "Formulating search queries...",
    "Searching web for relevant sources...",
    "Analyzing search results...",
    "Synthesizing findings...",
    "Verifying sources and citations...",
    "Drafting comprehensive response..."
  ];
  const [researchStatusIndex, setResearchStatusIndex] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTyping && useDeepResearch) {
      interval = setInterval(() => {
        setResearchStatusIndex((prev) => (prev + 1) % deepResearchStatuses.length);
      }, 3500);
    } else {
      setResearchStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isTyping, useDeepResearch, deepResearchStatuses.length]);

  // Sync messages to ref for saving
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Save when typing finishes
  useEffect(() => {
    if (!isTyping && messages.length > 0) {
      saveChatSession(messages);
    }
  }, [isTyping]);

  // Load session messages
  useEffect(() => {
    if (session && session.results) {
      if (session.type === 'ai_chat') {
        setMessages(session.results as Message[]);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [session?.id]);

  const saveChatSession = async (currentMessages: Message[]) => {
    if (!userId) return;
    
    try {
      if (session?.id && session.type === 'ai_chat') {
        await updateDoc(doc(db, 'sessions', session.id), {
          results: currentMessages,
          updatedAt: serverTimestamp()
        });
      } else {
        const newSession: Session = {
          userId: userId,
          type: 'ai_chat',
          title: currentMessages.length > 0 ? currentMessages[0].text.substring(0, 30) + '...' : 'New Chat',
          results: currentMessages,
          logs: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const sessionId = Date.now().toString();
        await setDoc(doc(db, 'sessions', sessionId), {
          ...newSession,
          id: sessionId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        if (onSessionCreated) {
          onSessionCreated(sessionId);
        }
      }
    } catch (e) {
      console.error('Failed to save chat session:', e);
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (onSessionCreated) {
      onSessionCreated('');
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleSpeak = (text: string, id: string) => {
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoiceURI) {
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;
    
    utterance.onend = () => {
      setSpeakingId(null);
    };
    
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleCopyAll = async () => {
    const text = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}:\n${m.text}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId('all');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy all:', err);
    }
  };

  const handleDownload = (format: 'json' | 'md' | 'txt') => {
    let content = '';
    let mime = 'text/plain';
    let filename = `chat-export-${Date.now()}`;

    if (format === 'json') {
      content = JSON.stringify(messages, null, 2);
      mime = 'application/json';
      filename += '.json';
    } else if (format === 'md') {
      content = messages.map(m => `### ${m.role === 'user' ? 'User' : 'AI'}\n${m.text}`).join('\n\n---\n\n');
      mime = 'text/markdown';
      filename += '.md';
    } else {
      content = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}:\n${m.text}`).join('\n\n');
      mime = 'text/plain';
      filename += '.txt';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  const toggleContext = (id: string) => {
    setSelectedContexts(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleQuickPrompt = (promptText: string) => {
    // If no context is selected, auto-select all available contexts that have results
    let currentSelectedContexts = selectedContexts;
    if (selectedContexts.length === 0 && allSessions.length > 0) {
      const activeTypes = Array.from(new Set(allSessions.filter(s => s.results && s.results.length > 0).map(s => s.type)));
      // Filter only the valid ones from availableContexts
      const validTypes = activeTypes.filter(type => availableContexts.some(c => c.id === type));
      if (validTypes.length > 0) {
        setSelectedContexts(validTypes);
        currentSelectedContexts = validTypes;
      }
    }
    
    // Instead of relying on state update and form submit, we can just call the submit logic directly
    submitPrompt(promptText, currentSelectedContexts);
  };

  const submitPrompt = async (textToSubmit: string, activeContexts: string[]) => {
    let finalMessage = textToSubmit;
    
    if (attachedFiles.length > 0) {
      const filesContext = attachedFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
      finalMessage += `\n\n${filesContext}`;
      setAttachedFiles([]);
    }

    if (!finalMessage.trim() || isTyping) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: textToSubmit };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setError('');

    let contextStr = '';
    
    // Build context from selected tabs
    if (activeContexts.length > 0 && allSessions.length > 0) {
      contextStr = 'Additional context from other tabs:\n\n';
      activeContexts.forEach(type => {
        // Find the most recent session for this type
        const latestSession = allSessions.filter(s => s.type === type).sort((a: any, b: any) => {
           const ta = a.updatedAt?.seconds || 0;
           const tb = b.updatedAt?.seconds || 0;
           return tb - ta;
        })[0];
        
        if (latestSession && latestSession.results) {
           contextStr += `--- Data from ${availableContexts.find(c => c.id === type)?.label} (Session: ${latestSession.title}) ---\n`;
           
           let currentContextLength = contextStr.length;
           // Dynamic limit based on character count to estimate tokens (approx 1M tokens)
           const MAX_CHARS = 4000000; 
           let includedCount = 0;
           
           for (const r of latestSession.results) {
             const itemStr = (typeof r === 'string' ? r : (r.url || JSON.stringify(r))) + '\n';
             if (currentContextLength + itemStr.length > MAX_CHARS) {
               contextStr += `\n...[TRUNCATED: ${latestSession.results.length - includedCount} items omitted to respect dynamic token window]\n\n`;
               break;
             }
             contextStr += itemStr;
             currentContextLength += itemStr.length;
             includedCount++;
           }
           if (includedCount === latestSession.results.length) {
             contextStr += '\n\n';
           }
        }
      });
    }

    try {
      const modelMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMessageId, role: 'model', text: '' }]);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messagesRef.current.map(m => ({ role: m.role, text: m.text })),
          message: finalMessage,
          context: contextStr,
          deepResearch: useDeepResearch,
          expertMode: expertMode
        })
      });

      if (!res.ok) {
        throw new Error('Failed to connect to AI server');
      }

      if (!res.body) throw new Error('ReadableStream not supported in this browser.');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last partial line in the buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.error) {
                setError(data.error);
                break;
              }
              if (data.type === 'model_used') {
                window.dispatchEvent(new CustomEvent('api-usage', { detail: { model: data.model, tokens: data.tokens } }));
                continue;
              }
              if (data.type === 'grounding_mapping') {
                setMessages(prev => prev.map(m => {
                  if (m.id === modelMessageId) {
                    return { ...m, grounding: data.mappings };
                  }
                  return m;
                }));
                continue;
              }
              if (data.text) {
                setMessages(prev => prev.map(m => {
                  if (m.id === modelMessageId) {
                    return { ...m, text: m.text + data.text };
                  }
                  return m;
                }));
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e, dataStr);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the response.');
    } finally {
      setIsTyping(false);
      setTimeout(() => {
        if (isAutoScrollEnabled && messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submitPrompt(input, selectedContexts);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAutoScrollEnabled(isAtBottom);
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAutoScrollEnabled && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages.length, isTyping, isAutoScrollEnabled]);

  const renderMessageText = (msg: Message) => {
    let text = msg.text || '';
    if (msg.grounding && msg.grounding.length > 0) {
       for (const mapping of msg.grounding) {
           text = text.split(mapping.vertexUrl).join(mapping.realUrl);
       }
       // Replace [1] with [[1]](url)
       text = text.replace(/\[(\d+)\]/g, (match, num) => {
          const idx = parseInt(num, 10) - 1;
          const mapping = msg.grounding?.find(m => m.index === idx);
          if (mapping) {
             return `[[${num}]](${mapping.realUrl})`;
          }
          return match;
       });
    }
    return text;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden relative">
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-900 z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">AI Assistant</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ask about your data</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className="flex items-center justify-center p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300"
            title="Voice Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <div className="hidden sm:block">
            <ApiUsageMonitor />
          </div>
          {messages.length > 0 && (
            <>
              <button 
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-300"
                title="Copy full conversation"
              >
                {copiedId === 'all' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                <span className="hidden md:inline">Copy All</span>
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden md:inline">Export</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showExportDropdown && (
                  <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden z-20 text-sm">
                    <button onClick={() => handleDownload('json')} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300 text-left">
                      <FileJson className="w-4 h-4" /> JSON
                    </button>
                    <button onClick={() => handleDownload('md')} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300 text-left">
                      <FileText className="w-4 h-4" /> Markdown
                    </button>
                    <button onClick={() => handleDownload('txt')} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300 text-left">
                      <File className="w-4 h-4" /> Text
                    </button>
                  </div>
                )}
              </div>

              <button 
                onClick={clearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </>
          )}
        </div>
        
        {/* Voice Settings Panel */}
        {showVoiceSettings && (
          <div className="absolute top-20 right-4 w-72 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-4 z-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Voice Settings</h3>
              <button onClick={() => setShowVoiceSettings(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Voice</label>
                <select 
                  value={selectedVoiceURI} 
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  {voices.map(voice => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Rate</label>
                  <span className="text-xs text-zinc-500">{speechRate.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" max="2" step="0.1" 
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Pitch</label>
                  <span className="text-xs text-zinc-500">{speechPitch.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1" 
                  value={speechPitch}
                  onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-zinc-900 relative">
        {/* Messages Area */}
        <div 
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar"
          onScroll={handleMessagesScroll}
          ref={messagesContainerRef}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
              <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-6">
                <Bot className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">How can I help?</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                I can analyze the URLs extracted in your current session, perform security audits, identify WordPress themes or plugins, and much more.
              </p>
              
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => handleQuickPrompt("Can you check for any potential vulnerabilities in these URLs?")} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors">
                  Check vulnerabilities
                </button>
                <button onClick={() => handleQuickPrompt("What plugins and themes are being used on this site?")} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors">
                  Identify plugins/themes
                </button>
                <button onClick={() => handleQuickPrompt("Summarize the structure of this website based on the URLs.")} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors">
                  Summarize structure
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={cn(
                  "flex gap-3 md:gap-4 max-w-[95%] md:max-w-4xl",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}>
                  <div className={cn(
                    "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm",
                    msg.role === 'user' 
                      ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" 
                      : "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
                  )}>
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  
                  <div className={cn(
                    "group relative px-4 py-3 md:px-5 md:py-4 rounded-2xl shadow-sm min-w-0 flex-1",
                    msg.role === 'user'
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 rounded-tl-none border border-zinc-200/50 dark:border-zinc-700/50"
                  )}>
                    {msg.role === 'model' && (
                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => handleSpeak(msg.text, msg.id)}
                          className={cn(
                            "p-1.5 md:p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm transition-colors",
                            speakingId === msg.id && "text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
                          )}
                          title={speakingId === msg.id ? "Stop speaking" : "Listen"}
                        >
                          {speakingId === msg.id ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="p-1.5 md:p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    <div className={cn(
                      "prose prose-sm md:prose-base max-w-full w-full break-words overflow-x-hidden",
                      msg.role === 'user' 
                        ? "text-white" 
                        : "prose-zinc dark:prose-invert"
                    )}>
                      {msg.role === 'model' ? (
                        <div className="markdown-body overflow-x-hidden w-full max-w-full">
                          {msg.text ? (
                            <ReactMarkdown>{renderMessageText(msg)}</ReactMarkdown>
                          ) : isTyping && msg.id === messages[messages.length-1].id ? (
                            useDeepResearch ? (
                              <div className="flex items-center gap-3 text-purple-600 dark:text-purple-400 py-1">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="font-medium animate-pulse">{deepResearchStatuses[researchStatusIndex]}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-zinc-500 py-1">
                                <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
                                <span className="text-sm font-medium">Thinking...</span>
                              </div>
                            )
                          ) : null}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap m-0">{msg.text}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="absolute bottom-[100px] left-4 right-4 md:left-6 md:right-6 z-10">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-start gap-2 border border-red-200 dark:border-red-800/30 shadow-lg">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 self-start">
              {/* Context Selector */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowContextDropdown(!showContextDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/50 transition-colors text-xs font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Context: {selectedContexts.length === 0 ? 'None' : `${selectedContexts.length} selected`}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showContextDropdown && (
                  <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-20">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Send latest data from tabs to AI</p>
                    </div>
                    <div className="p-1 max-h-48 overflow-y-auto">
                      {availableContexts.map(ctx => (
                        <button
                          key={ctx.id}
                          type="button"
                          onClick={() => toggleContext(ctx.id)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 text-left transition-colors"
                        >
                          {ctx.label}
                          {selectedContexts.includes(ctx.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Deep Research Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <div className="relative flex items-center justify-center w-4 h-4">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={useDeepResearch}
                    onChange={(e) => setUseDeepResearch(e.target.checked)}
                  />
                  <div className={cn(
                    "w-4 h-4 border rounded shadow-sm transition-colors flex items-center justify-center",
                    useDeepResearch 
                      ? "bg-purple-600 border-purple-600 dark:bg-purple-500 dark:border-purple-500" 
                      : "bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600 group-hover:border-purple-400"
                  )}>
                    {useDeepResearch && <CheckSquare className="w-3 h-3 text-white absolute" />}
                  </div>
                </div>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  Deep Dive Research
                </span>
              </label>

              {/* Expert Mode Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer group ml-1">
                <div className="relative flex items-center justify-center w-4 h-4">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={expertMode}
                    onChange={(e) => setExpertMode(e.target.checked)}
                  />
                  <div className={cn(
                    "w-4 h-4 border rounded shadow-sm transition-colors flex items-center justify-center",
                    expertMode 
                      ? "bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500" 
                      : "bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600 group-hover:border-indigo-400"
                  )}>
                    {expertMode && <CheckSquare className="w-3 h-3 text-white absolute" />}
                  </div>
                </div>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Expert Mode
                </span>
              </label>
            </div>

            {/* Attached Files */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-2">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/30 text-sm">
                    <FileText className="w-4 h-4" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <button 
                      type="button" 
                      onClick={() => removeAttachedFile(idx)}
                      className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form id="chat-form" onSubmit={handleSubmit} className="w-full">
              <div className="relative w-full flex items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about the extracted URLs..."
                  className="w-full bg-zinc-100 dark:bg-zinc-800 border-0 rounded-2xl py-3.5 pl-5 pr-32 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-zinc-900 transition-all resize-none custom-scrollbar min-h-[52px] max-h-[160px]"
                  rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
                  disabled={isTyping}
                />
                <label 
                  className="absolute right-24 bottom-2 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl cursor-pointer transition-all" 
                  title="Upload File(s)"
                >
                  <Upload className="w-5 h-5" />
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
                <button
                  type="button"
                  onClick={toggleDictation}
                  className={`absolute right-14 bottom-2 p-2 rounded-xl transition-all ${isListening ? 'text-red-500 bg-red-100 dark:bg-red-900/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  title={isListening ? "Stop dictation" : "Start dictation"}
                >
                  <Mic className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
                </button>
                <button
                  type="submit"
                  disabled={(!input.trim() && attachedFiles.length === 0) || isTyping}
                  className="absolute right-2 bottom-1.5 p-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl transition-all shadow-md active:scale-[0.95]"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="text-center mt-1">
               <p className="text-[11px] text-zinc-400">AI can make mistakes. Verify important information.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
