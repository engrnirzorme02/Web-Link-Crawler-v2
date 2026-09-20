import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

recovery_fn = """
  const handleRecovery = async () => {
    if (!userId) return;
    setLoading(true);
    setSessions([]); // Clear local state to force refresh UI
    
    try {
      // Force a server fetch to bypass cache
      const { getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'sessions'), where('userId', '==', userId));
      const snapshot = await getDocs(q); // getDocs naturally tries server first unless offline
      
      const loadedSessions: Session[] = [];
      snapshot.forEach((doc) => {
        loadedSessions.push({ id: doc.id, ...doc.data() } as Session);
      });
      loadedSessions.sort((a, b) => {
        const timeA = getMillis(a.createdAt);
        const timeB = getMillis(b.createdAt);
        return timeB - timeA;
      });
      
      setSessions(loadedSessions);
    } catch (err) {
      console.error("Recovery failed", err);
      alert("Failed to recover sessions from server. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  };
"""

content = content.replace("  const renameSession = async", recovery_fn.strip() + "\n\n  const renameSession = async")

content = content.replace("<HistoryDashboard \n                  sessions={sessions}", "<HistoryDashboard \n                  onRecovery={handleRecovery}\n                  sessions={sessions}")

with open('src/App.tsx', 'w') as f:
    f.write(content)
