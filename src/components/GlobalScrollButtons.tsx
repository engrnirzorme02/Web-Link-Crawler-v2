import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronRight, ChevronsUpDown, EyeOff, SlidersHorizontal, Navigation } from 'lucide-react';

export const GlobalScrollButtons = () => {
  const [isMinimized, setIsMinimized] = useState(false);

  const scrollAll = (direction: 'top' | 'bottom') => {
    const containers = document.querySelectorAll('.custom-scrollbar, [class*="overflow-y-auto"]');
    let scrolledAtLeastOne = false;
    
    containers.forEach(el => {
      const htmlEl = el as HTMLElement;
      // Only target visible containers that actually have scrollable content
      if (htmlEl.scrollHeight > htmlEl.clientHeight && htmlEl.offsetParent !== null) {
        htmlEl.scrollTo({ 
          top: direction === 'top' ? 0 : htmlEl.scrollHeight, 
          behavior: 'smooth' 
        });
        scrolledAtLeastOne = true;
      }
    });

    // Fallback to window scroll if no specific container was scrolled
    if (!scrolledAtLeastOne) {
      window.scrollTo({
        top: direction === 'top' ? 0 : document.body.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-16 right-2 sm:bottom-8 sm:right-6 z-[9999]">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-full shadow-lg backdrop-blur-md transition-all active:scale-95 flex items-center justify-center gap-1 text-[10px] font-bold border border-indigo-400/40 opacity-70 hover:opacity-100"
          title="Show Scroll Controls"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-16 right-2 sm:bottom-8 sm:right-6 flex flex-col gap-1.5 z-[9999] opacity-65 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
      {/* Minimize Toggle */}
      <button
        onClick={() => setIsMinimized(true)}
        className="self-end p-1 bg-zinc-800/60 hover:bg-zinc-800 dark:bg-zinc-200/60 dark:hover:bg-zinc-200 text-zinc-300 dark:text-zinc-700 rounded-full text-[10px] shadow transition-all active:scale-90 mb-0.5"
        title="Minimize Scroll Controls"
      >
        <EyeOff className="w-3 h-3" />
      </button>

      <button 
        onClick={() => scrollAll('top')} 
        className="p-2 sm:p-2.5 bg-zinc-900/90 dark:bg-zinc-100/90 hover:bg-zinc-900 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg backdrop-blur-md transition-all active:scale-95 group border border-zinc-700/40 dark:border-zinc-300/40"
        title="Scroll to Top"
      >
        <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5 opacity-90 group-hover:opacity-100" />
      </button>

      <button 
        onClick={() => scrollAll('bottom')} 
        className="p-2 sm:p-2.5 bg-zinc-900/90 dark:bg-zinc-100/90 hover:bg-zinc-900 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg backdrop-blur-md transition-all active:scale-95 group border border-zinc-700/40 dark:border-zinc-300/40"
        title="Scroll to Bottom"
      >
        <ArrowDown className="w-4 h-4 sm:w-5 sm:h-5 opacity-90 group-hover:opacity-100" />
      </button>
    </div>
  );
};

