import re

with open('src/components/Crawler.tsx', 'r') as f:
    content = f.read()

# Add Cloud, CloudOff to imports
content = content.replace("Upload, Search } from 'lucide-react'", "Upload, Search, Cloud, CloudOff, Check } from 'lucide-react'")

# Add state
content = content.replace("  const [showExportMenu, setShowExportMenu] = useState(false);", "  const [showExportMenu, setShowExportMenu] = useState(false);\n  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');")

# Find updateDoc and add setSaveStatus
# Instead of complex regex, let's just insert it by replacing the updateDoc calls
content = re.sub(
    r'(await updateDoc\([^)]+\)[\s\S]*?updatedAt:[^}]+\}\);)',
    r'setSaveStatus("saving"); \1 setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);',
    content
)
content = re.sub(
    r'(updateDoc\([^)]+\)[\s\S]*?updatedAt:[^}]+\}\))\.catch\(console\.error\);',
    r'\1.then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000); }).catch((e) => { console.error(e); setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); });',
    content
)

# Also addDoc
content = re.sub(
    r'(const docRef = await addDoc\([^)]+\)[\s\S]*?updatedAt:[^}]+\}\);)',
    r'setSaveStatus("saving"); \1 setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 3000);',
    content
)

# Render the indicator
indicator_jsx = """
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1">
                Cloud Sync
                {saveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                {saveStatus === 'saved' && <Cloud className="w-3 h-3 text-emerald-500" />}
                {saveStatus === 'error' && <CloudOff className="w-3 h-3 text-red-500" />}
              </span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {saveStatus === 'saving' && 'Saving...'}
                {saveStatus === 'saved' && 'Persisted'}
                {saveStatus === 'error' && 'Save Failed'}
                {saveStatus === 'idle' && 'Up to date'}
              </span>
            </div>
"""

# Find grid cols 4
content = content.replace("grid-cols-2 md:grid-cols-4", "grid-cols-2 md:grid-cols-5")
content = content.replace("            <div className=\"flex flex-col\">\n              <span className=\"text-xs text-zinc-500 dark:text-zinc-400 font-medium\">Status</span>", indicator_jsx.strip('\n') + "\n            <div className=\"flex flex-col\">\n              <span className=\"text-xs text-zinc-500 dark:text-zinc-400 font-medium\">Status</span>")

with open('src/components/Crawler.tsx', 'w') as f:
    f.write(content)
