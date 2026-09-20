import re

with open('src/components/AIChat.tsx', 'r') as f:
    content = f.read()

# Add voice settings button in header
header_btn = """
          <button 
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className="flex items-center justify-center p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300"
            title="Voice Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
"""
content = content.replace("<div className=\"flex items-center gap-2 md:gap-3\">", "<div className=\"flex items-center gap-2 md:gap-3\">\n" + header_btn.strip('\n'))

# Add mic button next to textarea
mic_btn = """
              <button
                type="button"
                onClick={toggleDictation}
                className={`absolute right-14 bottom-2 p-2 rounded-xl transition-all ${isListening ? 'text-red-500 bg-red-100 dark:bg-red-900/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                title={isListening ? "Stop dictation" : "Start dictation"}
              >
                <Mic className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
              </button>
"""
content = content.replace("              <button\n                type=\"submit\"", mic_btn.strip('\n') + "\n              <button\n                type=\"submit\"")
content = content.replace("pr-14 text-zinc-900", "pr-24 text-zinc-900") # Increase padding for textarea to fit mic

# Add Voice Settings Panel
voice_panel = """
      {/* Voice Settings Panel */}
      {showVoiceSettings && (
        <div className="absolute top-20 right-4 md:right-6 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Voice Settings</h3>
            <button onClick={() => setShowVoiceSettings(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Voice</label>
              <select 
                value={selectedVoiceURI}
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-500"
              >
                {voices.map((v, i) => (
                  <option key={i} value={v.voiceURI}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Speed</label>
                <span className="text-xs text-zinc-400">{speechRate.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.5" max="2" step="0.1" 
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pitch</label>
                <span className="text-xs text-zinc-400">{speechPitch.toFixed(1)}</span>
              </div>
              <input 
                type="range" min="0" max="2" step="0.1" 
                value={speechPitch}
                onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
          </div>
        </div>
      )}
"""
content = content.replace("      <div className=\"flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative\">", "      <div className=\"flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative\">\n" + voice_panel.strip('\n'))


with open('src/components/AIChat.tsx', 'w') as f:
    f.write(content)
