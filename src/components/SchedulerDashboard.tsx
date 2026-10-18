import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Clock, Play, Pause, Trash2, Plus, Edit2, CheckCircle2, 
  XCircle, AlertTriangle, RefreshCw, Bell, BellOff, Download, 
  ExternalLink, Layers, History, Shield, ArrowRight, Loader2, Sparkles,
  Search, Filter
} from 'lucide-react';
import { 
  db, CrawlSchedule, CrawlLog, handleFirestoreError, OperationType 
} from '../lib/firebase';
import { 
  collection, query, where, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { cn, getMillis, truncateForFirestore } from '../lib/utils';
import { format, formatDistanceToNow, addHours, addDays, addWeeks } from 'date-fns';

interface SchedulerDashboardProps {
  userId: string | null;
  onOpenCrawler?: (url: string) => void;
}

export function SchedulerDashboard({ userId, onOpenCrawler }: SchedulerDashboardProps) {
  const [schedules, setSchedules] = useState<CrawlSchedule[]>([]);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [activeTab, setActiveTab] = useState<'schedules' | 'logs' | 'create'>('schedules');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Active running job state
  const [activeRunningJob, setActiveRunningJob] = useState<{
    scheduleId?: string;
    name: string;
    url: string;
    pagesCrawled: number;
    linksFound: number;
    statusText: string;
    startTime: number;
  } | null>(null);

  // Form State for New / Edit Schedule
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formFrequency, setFormFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'once' | 'monthly'>('daily');
  const [formTime, setFormTime] = useState('09:00');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formMaxPages, setFormMaxPages] = useState(50);
  const [formMaxDepth, setFormMaxDepth] = useState(3);
  const [formCustomRegex, setFormCustomRegex] = useState('');
  const [formNotify, setFormNotify] = useState(true);
  const [formSubdomains, setFormSubdomains] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Check Notification API permission
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    }
  };

  // Sound chime for completion notification
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  };

  // Subscribe to schedules
  useEffect(() => {
    if (!userId) {
      setLoadingSchedules(false);
      return;
    }

    const q = query(
      collection(db, 'crawl_schedules'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: CrawlSchedule[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as CrawlSchedule);
      });
      list.sort((a, b) => {
        const timeA = getMillis(a.createdAt);
        const timeB = getMillis(b.createdAt);
        return timeB - timeA;
      });
      setSchedules(list);
      setLoadingSchedules(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'crawl_schedules');
      setLoadingSchedules(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Subscribe to logs
  useEffect(() => {
    if (!userId) {
      setLoadingLogs(false);
      return;
    }

    const q = query(
      collection(db, 'crawl_logs'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: CrawlLog[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as CrawlLog);
      });
      list.sort((a, b) => {
        const timeA = getMillis(a.executedAt);
        const timeB = getMillis(b.executedAt);
        return timeB - timeA;
      });
      setLogs(list);
      setLoadingLogs(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'crawl_logs');
      setLoadingLogs(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Calculate Next Run Date based on Frequency
  const computeNextRun = (freq: 'hourly' | 'daily' | 'weekly' | 'once' | 'monthly', dateStr?: string, timeStr?: string) => {
    const now = new Date();
    if (freq === 'hourly') {
      return addHours(now, 1);
    }
    if (freq === 'daily') {
      const [h, m] = (timeStr || '09:00').split(':').map(Number);
      const target = new Date();
      target.setHours(h, m, 0, 0);
      if (target <= now) {
        return addDays(target, 1);
      }
      return target;
    }
    if (freq === 'weekly') {
      return addWeeks(now, 1);
    }
    if (freq === 'monthly') {
      return addDays(now, 30);
    }
    if (freq === 'once') {
      const [y, mon, d] = (dateStr || now.toISOString().slice(0, 10)).split('-').map(Number);
      const [h, m] = (timeStr || '09:00').split(':').map(Number);
      const target = new Date(y, mon - 1, d, h, m, 0, 0);
      return target > now ? target : addHours(now, 1);
    }
    return addDays(now, 1);
  };

  // Handle Save / Update Schedule
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      alert('Please sign in to save crawl schedules.');
      return;
    }
    if (!formUrl.trim() || !formName.trim()) {
      alert('Job Name and Target URL are required.');
      return;
    }

    setIsSubmitting(true);
    let targetUrl = formUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const nextRun = computeNextRun(formFrequency, formDate, formTime);

    try {
      if (editingScheduleId) {
        await updateDoc(doc(db, 'crawl_schedules', editingScheduleId), {
          name: formName.trim(),
          url: targetUrl,
          frequency: formFrequency,
          scheduledTime: formTime,
          nextRunAt: nextRun.toISOString(),
          maxPages: formMaxPages,
          maxDepth: formMaxDepth,
          filters: {
            customRegex: formCustomRegex.trim(),
            subdomains: formSubdomains
          },
          notifyOnComplete: formNotify,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'crawl_schedules'), {
          userId,
          name: formName.trim(),
          url: targetUrl,
          frequency: formFrequency,
          scheduledTime: formTime,
          nextRunAt: nextRun.toISOString(),
          status: 'active',
          maxPages: formMaxPages,
          maxDepth: formMaxDepth,
          filters: {
            customRegex: formCustomRegex.trim(),
            subdomains: formSubdomains
          },
          notifyOnComplete: formNotify,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      resetForm();
      setActiveTab('schedules');
    } catch (err) {
      console.error('Failed to save schedule:', err);
      handleFirestoreError(err, editingScheduleId ? OperationType.UPDATE : OperationType.CREATE, 'crawl_schedules');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingScheduleId(null);
    setFormName('');
    setFormUrl('');
    setFormFrequency('daily');
    setFormTime('09:00');
    setFormMaxPages(50);
    setFormMaxDepth(3);
    setFormCustomRegex('');
    setFormNotify(true);
    setFormSubdomains(true);
  };

  const handleEditSchedule = (s: CrawlSchedule) => {
    setEditingScheduleId(s.id!);
    setFormName(s.name);
    setFormUrl(s.url);
    setFormFrequency(s.frequency);
    setFormTime(s.scheduledTime || '09:00');
    setFormMaxPages(s.maxPages || 50);
    setFormMaxDepth(s.maxDepth || 3);
    setFormCustomRegex(s.filters?.customRegex || '');
    setFormNotify(s.notifyOnComplete ?? true);
    setFormSubdomains(s.filters?.subdomains ?? true);
    setActiveTab('create');
  };

  const handleDeleteSchedule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this crawl schedule?')) return;
    try {
      await deleteDoc(doc(db, 'crawl_schedules', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'crawl_schedules');
    }
  };

  const togglePauseSchedule = async (s: CrawlSchedule, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextStatus = s.status === 'active' ? 'paused' : 'active';
      await updateDoc(doc(db, 'crawl_schedules', s.id!), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'crawl_schedules');
    }
  };

  // Execute Crawl Job (Used by "Run Now" or Scheduled Background Runner)
  const executeCrawlJob = async (schedule: CrawlSchedule) => {
    if (activeRunningJob) {
      alert('Another crawl job is currently running. Please wait for it to complete.');
      return;
    }

    const startTime = Date.now();
    setActiveRunningJob({
      scheduleId: schedule.id,
      name: schedule.name,
      url: schedule.url,
      pagesCrawled: 0,
      linksFound: 0,
      statusText: 'Connecting to crawler...',
      startTime
    });

    let pagesCrawled = 0;
    let linksFound = 0;
    let errorsCount = 0;
    const discoveredUrls: string[] = [];

    const params = new URLSearchParams({
      url: schedule.url,
      mode: 'domain',
      maxPages: String(schedule.maxPages || 50),
      maxDepth: String(schedule.maxDepth || 3),
      subdomainOnly: String(schedule.filters?.subdomains ?? true)
    });

    if (schedule.filters?.customRegex) {
      params.append('customRegex', schedule.filters.customRegex);
    }

    const eventSource = new EventSource(`/api/crawl?${params.toString()}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          if (data.stats?.pagesCrawled !== undefined) {
            pagesCrawled = data.stats.pagesCrawled;
          }
          setActiveRunningJob(prev => prev ? {
            ...prev,
            pagesCrawled,
            statusText: data.message || `Crawling: ${data.stats?.currentUrl || ''}`
          } : null);
        } else if (data.type === 'link') {
          linksFound++;
          if (data.url && !discoveredUrls.includes(data.url)) {
            discoveredUrls.push(data.url);
          }
          setActiveRunningJob(prev => prev ? {
            ...prev,
            linksFound
          } : null);
        } else if (data.type === 'error') {
          errorsCount++;
        } else if (data.type === 'done') {
          eventSource.close();
          finishJob(schedule, pagesCrawled, linksFound, errorsCount, startTime, 'completed', undefined, discoveredUrls);
        }
      } catch (e) {}
    };

    eventSource.onerror = () => {
      eventSource.close();
      finishJob(schedule, pagesCrawled, linksFound, errorsCount + 1, startTime, 'failed', 'Connection lost or network timeout', discoveredUrls);
    };
  };

  // Finish Crawl Job: Record log, update schedule, save session document, notify user
  const finishJob = async (
    schedule: CrawlSchedule, 
    pagesCrawled: number, 
    linksFound: number, 
    errorsCount: number, 
    startTime: number, 
    status: 'completed' | 'failed',
    errorMessage?: string,
    discoveredUrls: string[] = []
  ) => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    setActiveRunningJob(null);

    // 1. Log to Firestore and save session document
    if (userId) {
      try {
        await addDoc(collection(db, 'crawl_logs'), {
          scheduleId: schedule.id || null,
          scheduleName: schedule.name,
          userId,
          url: schedule.url,
          status,
          pagesCrawled,
          linksFound,
          errorsCount,
          duration,
          errorMessage: errorMessage || null,
          executedAt: serverTimestamp()
        });

        // Explicitly save the discovered URLs as a new document in the sessions collection
        if (discoveredUrls.length > 0) {
          const sessionPayload = {
            userId,
            type: 'crawler',
            title: `Scheduled: ${schedule.name}`,
            url: schedule.url,
            results: discoveredUrls.map(u => ({ url: u, source: 'scheduler' })),
            logs: [`Scheduled crawl "${schedule.name}" completed with ${discoveredUrls.length} discovered links.`],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          await addDoc(collection(db, 'sessions'), truncateForFirestore(sessionPayload));
        }

        // 2. Advance schedule nextRunAt
        if (schedule.id) {
          const nextRun = computeNextRun(schedule.frequency, undefined, schedule.scheduledTime);
          await updateDoc(doc(db, 'crawl_schedules', schedule.id), {
            lastRunAt: new Date().toISOString(),
            lastStatus: status,
            lastResultCount: linksFound,
            nextRunAt: schedule.frequency === 'once' ? null : nextRun.toISOString(),
            status: schedule.frequency === 'once' ? 'paused' : schedule.status,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.error('Failed to log crawl job execution:', err);
      }
    }

    // 3. User Notification & Audio Chime
    playNotificationSound();

    if (schedule.notifyOnComplete && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`Crawl Finished: ${schedule.name}`, {
        body: status === 'completed' 
          ? `Discovered ${linksFound} URLs across ${pagesCrawled} pages in ${duration}s.` 
          : `Crawl encountered errors: ${errorMessage || 'Failed'}`,
        icon: '/favicon.ico'
      });
    }
  };

  // Automated Background Execution is permanently KILLED / DEACTIVATED
  // in compliance with Google Cloud policy violation & spam flag prevention directives.
  // No recurring timers, background crawls, or automated pings will run.

  // Export historical execution logs to CSV
  const exportLogsCsv = () => {
    let csv = "Date,Job Name,Target URL,Status,Pages Crawled,Links Discovered,Duration (s),Errors,Error Message\n";
    logs.forEach(l => {
      const date = l.executedAt ? format(new Date(getMillis(l.executedAt)), 'yyyy-MM-dd HH:mm:ss') : '';
      csv += `"${date}","${l.scheduleName}","${l.url}","${l.status}","${l.pagesCrawled}","${l.linksFound}","${l.duration}","${l.errorsCount}","${l.errorMessage || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `crawl-history-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* Active Running Job Banner */}
      {activeRunningJob && (
        <div className="p-3.5 bg-blue-600 text-white flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2.5 min-w-0">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <div className="text-xs truncate">
              <span className="font-bold">{activeRunningJob.name}:</span> {activeRunningJob.statusText}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono shrink-0">
            <span>Pages: {activeRunningJob.pagesCrawled}</span>
            <span>Links: {activeRunningJob.linksFound}</span>
            <span className="bg-blue-700 px-2 py-0.5 rounded text-[11px]">Running</span>
          </div>
        </div>
      )}

      {/* Header and Navigation */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Scheduling & Crawl Monitoring
              <span className="text-xs font-normal text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                {schedules.length} Jobs
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Automated recurring web crawls, real-time background progress, and historical execution audits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {notificationPermission !== 'granted' && (
            <button
              onClick={requestNotificationPermission}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              Enable Alerts
            </button>
          )}

          <div className="flex bg-zinc-200/60 dark:bg-zinc-800/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => setActiveTab('schedules')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                activeTab === 'schedules' ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Scheduled Jobs ({schedules.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                activeTab === 'logs' ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              )}
            >
              <History className="w-3.5 h-3.5" />
              Audit Logs ({logs.length})
            </button>
            <button
              onClick={() => {
                resetForm();
                setActiveTab('create');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5",
                activeTab === 'create' ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400 shadow-2xs" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              New Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-4 flex-1">
        {/* SCHEDULES LIST TAB */}
        {activeTab === 'schedules' && (
          <div className="space-y-3">
            {/* Passive Mode Protection Banner */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  🛡️ প্যাসিভ সুরক্ষা মোড সক্রিয় (Passive Safe Mode Active)
                </p>
                <p className="text-emerald-700 dark:text-emerald-400">
                  গুগল ক্লাউড পলিসি ভায়োলেশন এবং অটোমেটেড স্প্যাম ফ্ল্যাগ এড়াতে সমস্ত ব্যাকগ্রাউন্ড টাইমার, রিকারিং অটো-ক্রলিং লুপ ও এক্সটার্নাল পিং স্থায়ীভাবে বন্ধ (Cancelled/Killed) করা হয়েছে। আপনার শিডিউল তালিকা এবং ডাটাবেজ তথ্য সম্পূর্ণ অক্ষত রয়েছে।
                </p>
              </div>
            </div>

            {schedules.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                <Calendar className="w-8 h-8 mx-auto opacity-30 text-purple-500" />
                <p>No crawl jobs scheduled yet.</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Schedule Your First Crawl
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {schedules.map(s => {
                  const isDue = s.status === 'active' && s.nextRunAt && new Date(s.nextRunAt) <= new Date();

                  return (
                    <div 
                      key={s.id} 
                      className={cn(
                        "p-3.5 bg-zinc-50/80 dark:bg-zinc-800/40 border rounded-2xl space-y-3 transition-all",
                        s.status === 'paused' ? "opacity-60 border-zinc-200 dark:border-zinc-800" : "border-zinc-200 dark:border-zinc-700/80 hover:shadow-xs"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {s.name}
                            </h4>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                              s.status === 'active' ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                            )}>
                              {s.status}
                            </span>
                            {isDue && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 animate-pulse">
                                Due Now
                              </span>
                            )}
                          </div>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline truncate block mt-0.5"
                          >
                            {s.url}
                          </a>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => executeCrawlJob(s)}
                            disabled={!!activeRunningJob}
                            className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-xs transition-colors"
                            title="Run immediately"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => togglePauseSchedule(s, e)}
                            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 rounded-lg text-xs transition-colors"
                            title={s.status === 'active' ? "Pause schedule" : "Resume schedule"}
                          >
                            {s.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleEditSchedule(s)}
                            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 rounded-lg text-xs transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSchedule(s.id!, e)}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 rounded-lg text-xs transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60">
                          <span className="text-[10px] text-zinc-400 block">Frequency</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">
                            {s.frequency} {s.scheduledTime ? `at ${s.scheduledTime}` : ''}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60">
                          <span className="text-[10px] text-zinc-400 block">Next Execution</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono text-[11px] truncate block">
                            {s.nextRunAt ? formatDistanceToNow(new Date(s.nextRunAt), { addSuffix: true }) : 'Paused'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                        <span>Max Pages: {s.maxPages || 50} | Depth: {s.maxDepth || 3}</span>
                        {s.lastRunAt && (
                          <span className="text-zinc-500">
                            Last: {s.lastResultCount ?? 0} links ({s.lastStatus})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">
                Total completed runs: {logs.length}
              </span>
              {logs.length > 0 && (
                <button
                  onClick={exportLogsCsv}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export History CSV
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <History className="w-8 h-8 mx-auto opacity-30 text-zinc-400" />
                <p>No historical crawl runs recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3">Executed</th>
                      <th className="p-3">Job Name</th>
                      <th className="p-3">Target URL</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Links Found</th>
                      <th className="p-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="p-3 text-zinc-500 text-[11px] whitespace-nowrap">
                          {log.executedAt ? format(new Date(getMillis(log.executedAt)), 'MMM dd, HH:mm') : '-'}
                        </td>
                        <td className="p-3 text-zinc-900 dark:text-zinc-100 font-medium font-sans">
                          {log.scheduleName}
                        </td>
                        <td className="p-3 text-zinc-500 max-w-xs truncate">
                          <a href={log.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            {log.url}
                          </a>
                        </td>
                        <td className="p-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                            log.status === 'completed' ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                          )}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-900 dark:text-zinc-100 font-bold">
                          {log.linksFound}
                        </td>
                        <td className="p-3 text-zinc-500">
                          {log.duration}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CREATE / EDIT SCHEDULE TAB */}
        {activeTab === 'create' && (
          <form onSubmit={handleSaveSchedule} className="max-w-xl mx-auto space-y-4 py-2">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {editingScheduleId ? 'Edit Crawl Schedule' : 'Create Recurring Crawl Schedule'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab('schedules');
                }}
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Job Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Weekly Sitemap Audit, Daily Price Watch"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Target Website URL
              </label>
              <input
                type="text"
                required
                placeholder="https://example.com"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Recurrence Frequency
                </label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
                >
                  <option value="daily">Daily (Every 24 hours)</option>
                  <option value="weekly">Weekly</option>
                  <option value="hourly">Hourly</option>
                  <option value="once">Run Once at Specific Time</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Scheduled Time
                </label>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
                />
              </div>
            </div>

            {formFrequency === 'once' && (
              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Max Crawl Depth
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={formMaxDepth}
                  onChange={(e) => setFormMaxDepth(parseInt(e.target.value) || 2)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Max Pages Limit
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={formMaxPages}
                  onChange={(e) => setFormMaxPages(parseInt(e.target.value) || 50)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Optional Custom URL Filter Regex
              </label>
              <input
                type="text"
                placeholder="e.g. ^https://example\.com/blog/.*"
                value={formCustomRegex}
                onChange={(e) => setFormCustomRegex(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSubdomains}
                  onChange={(e) => setFormSubdomains(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                Allow Subdomains
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formNotify}
                  onChange={(e) => setFormNotify(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                Desktop & Sound Alert on Finish
              </label>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab('schedules');
                }}
                className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {editingScheduleId ? 'Update Schedule' : 'Save Schedule'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
