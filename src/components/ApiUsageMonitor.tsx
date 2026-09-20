import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Cpu, BarChart2, Calendar, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const dailyData = [
  { day: 'Mon', requests: 120 },
  { day: 'Tue', requests: 300 },
  { day: 'Wed', requests: 150 },
  { day: 'Thu', requests: 400 },
  { day: 'Fri', requests: 250 },
  { day: 'Sat', requests: 80 },
  { day: 'Sun', requests: 50 },
];

const monthlyData = [
  { month: 'Jan', requests: 1200 },
  { month: 'Feb', requests: 2100 },
  { month: 'Mar', requests: 800 },
  { month: 'Apr', requests: 1500 },
  { month: 'May', requests: 3000 },
  { month: 'Jun', requests: 2500 },
];

export function ApiUsageMonitor() {
  const [tokenUsage, setTokenUsage] = useState(0);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleUsageUpdate = (e: any) => {
      if (e.detail?.tokens) {
        setTokenUsage(prev => {
          const newUsage = prev + e.detail.tokens;
          return newUsage;
        });
      }
      if (e.detail?.model) {
        setModel(e.detail.model);
      }
    };
    window.addEventListener('api-usage', handleUsageUpdate);
    
    const decayInterval = setInterval(() => {
      setTokenUsage(prev => Math.max(0, prev - 1000));
    }, 5000);

    return () => {
      window.removeEventListener('api-usage', handleUsageUpdate);
      clearInterval(decayInterval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const limit = 32000;
  const usagePercentage = Math.min(100, Math.round((tokenUsage / limit) * 100));
  const isWarning = usagePercentage > 75;
  const isDanger = usagePercentage > 95;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1.5 shadow-sm ml-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50",
          isOpen && "ring-2 ring-blue-500/50"
        )}
      >
        <div className="flex items-center gap-1.5 border-r border-zinc-200 dark:border-zinc-800 pr-3">
          <Cpu className="w-4 h-4 text-purple-600" />
          <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-w-[120px] truncate">
            {model.replace('-preview', '')}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Activity className={cn("w-4 h-4", isDanger ? "text-red-500 animate-pulse" : isWarning ? "text-amber-500" : "text-emerald-500")} />
          <div className="w-20 md:w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
          <span className={cn(
            "text-[10px] font-bold w-7",
            isDanger ? "text-red-600 dark:text-red-400" : isWarning ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          )}>
            {usagePercentage}%
          </span>
        </div>
      </button>

      {isWarning && !isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 z-50 whitespace-nowrap">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Approaching API limits. Auto-switching model if needed.</span>
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                API Consumption
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Gemini API Request Volume</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab('daily')}
                className={cn(
                  "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                  activeTab === 'daily' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                Daily
              </button>
              <button 
                onClick={() => setActiveTab('monthly')}
                className={cn(
                  "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                  activeTab === 'monthly' ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                Monthly
              </button>
            </div>

            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'daily' ? (
                  <LineChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#71717a' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#71717a' }} 
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      itemStyle={{ color: '#8b5cf6', fontWeight: 500 }}
                      formatter={(value: number) => [`${value} reqs`, 'Usage']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="requests" 
                      stroke="#8b5cf6" 
                      strokeWidth={2} 
                      dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }} 
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#71717a' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#71717a' }} 
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      itemStyle={{ color: '#0ea5e9', fontWeight: 500 }}
                      cursor={{ fill: 'rgba(113, 113, 122, 0.1)' }}
                      formatter={(value: number) => [`${value} reqs`, 'Usage']}
                    />
                    <Bar 
                      dataKey="requests" 
                      fill="#0ea5e9" 
                      radius={[4, 4, 0, 0]} 
                      maxBarSize={30}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Current billing cycle</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {activeTab === 'daily' ? '1,300 total' : '11,100 total'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
