import re

with open('src/components/AIChat.tsx', 'r') as f:
    content = f.read()

# Add imports
content = content.replace("Volume2, SquareSquare } from 'lucide-react'", "Volume2, SquareSquare, Mic, Settings2, X } from 'lucide-react'")

# Add state variables
state_vars = """
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
      if (availableVoices.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(availableVoices[0].voiceURI);
      }
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
"""
content = content.replace("  const [speakingId, setSpeakingId] = useState<string | null>(null);", state_vars.strip())

# Update handleSpeak
handle_speak_new = """
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
"""
content = re.sub(r'  const handleSpeak = \(text: string, id: string\) => \{[\s\S]*?  \};\n', handle_speak_new.strip() + '\n\n', content)

with open('src/components/AIChat.tsx', 'w') as f:
    f.write(content)
