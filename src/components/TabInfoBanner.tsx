import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  tab: string;
}

const tabInfo: Record<string, { title: string; description: string }> = {
  crawler: {
    title: 'Crawler (ক্রলার)',
    description: 'এই ট্যাবের মাধ্যমে আপনি একটি নির্দিষ্ট ডোমেইন বা ওয়েবসাইটের বিভিন্ন লিংক বা পেইজগুলো খুঁজে বের করতে পারবেন। এটি ওয়েবসাইটের ডেপথ, সাবডোমেইন এবং নির্দিষ্ট ফাইল টাইপ অনুযায়ী ডেটা সংগ্রহ করতে সাহায্য করে।'
  },
  smart_crawler: {
    title: 'Smart Crawler (স্মার্ট ক্রলার)',
    description: 'এটি এআই (AI) চালিত একটি ক্রলার। আপনি ন্যাচারাল ল্যাঙ্গুয়েজে (যেমন: "আমাকে শুধু প্রোডাক্ট পেজগুলো দাও") ইন্সট্রাকশন দিলে, এটি স্বয়ংক্রিয়ভাবে শুধুমাত্র আপনার প্রয়োজনীয় লিংকগুলোই খুঁজে বের করবে।'
  },
  data_extractor: {
    title: 'Local Extractor (লোকাল এক্সট্রাক্টর)',
    description: 'আপনার লোকাল ডিভাইসের কোনো টেক্সট বা সোর্স কোড থেকে নির্দিষ্ট প্যাটার্নের ডেটা (যেমন- ইমেইল, ফোন নাম্বার, কাস্টম রেজেক্স) খুঁজে বের করার জন্য এটি ব্যবহার করা হয়।'
  },
  extractor: {
    title: 'Extractor (এক্সট্রাক্টর)',
    description: 'কোনো ওয়েবসাইটের লাইভ লিংক থেকে নির্দিষ্ট ডেটা স্ক্র্যাপ বা এক্সট্র্যাক্ট করার জন্য এটি ব্যবহৃত হয়। আপনি রেজেক্স বা নির্দিষ্ট নিয়ম সেট করে দিলে, এটি ওই পেজগুলো থেকে ডেটা সংগ্রহ করে আনবে।'
  },
  url_processor: {
    title: 'Processor (প্রসেসর)',
    description: 'একাধিক ইউআরএল (URL) একসাথে প্রসেস, ফিল্টার, ডুপ্লিকেট রিমুভ অথবা নির্দিষ্ট প্যারামিটার অনুযায়ী সাজানোর জন্য এই টুলটি ব্যবহার করা হয়।'
  },
  bulk: {
    title: 'Fetch (বাল্ক ফেচ)',
    description: 'একসাথে অনেকগুলো লিংকের স্ট্যাটাস চেক করা, পেজের টাইটেল আনা বা কোনো নির্দিষ্ট তথ্য একবারে অনেকগুলো পেজ থেকে নিয়ে আসার কাজ এই ট্যাবের মাধ্যমে সহজে করা যায়।'
  },
  ai_chat: {
    title: 'Chat (চ্যাট)',
    description: 'এটি একটি এআই অ্যাসিস্ট্যান্ট। আপনার সংগ্রহ করা ডেটা বা ক্রল করা লিংকের উপর ভিত্তি করে আপনি এখানে এআই-কে প্রশ্ন করতে পারবেন এবং সে ডেটা অ্যানালাইজ করে উত্তর দিবে।'
  },
  search: {
    title: 'YouTube Search (ইউটিউব সার্চ)',
    description: 'ইউটিউবের বিভিন্ন ভিডিও, চ্যানেল বা প্লেলিস্ট সহজেই সার্চ করার জন্য এই অপশনটি ব্যবহার করা হয়।'
  },
  analyzer: {
    title: 'YouTube Analyzer (ইউটিউব অ্যানালাইজার)',
    description: 'ইউটিউব ভিডিওর বিস্তারিত তথ্য, ভিউ, এনগেজমেন্ট বা অন্যান্য স্ট্যাটিস্টিকস এনালাইসিস করার জন্য এই টুলটি কাজে লাগে।'
  }
};

export function TabInfoBanner({ tab }: Props) {
  const [expanded, setExpanded] = useState(false);
  const info = tabInfo[tab];

  if (!info) return null;

  return (
    <div className="mx-2 md:mx-0 mt-4 mb-2 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl overflow-hidden transition-all shrink-0">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-100/50 dark:hover:bg-blue-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <Info className="w-5 h-5 shrink-0" />
          <span className="font-medium text-sm">এই টুলটির কাজ কী? জানতে এখানে ক্লিক করুন...</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-blue-600 dark:text-blue-500 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-500 shrink-0" />
        )}
      </button>
      
      {expanded && (
        <div className="px-4 pb-4 pt-1 text-sm text-blue-900 dark:text-blue-200 border-t border-blue-100 dark:border-blue-800/50 mt-1">
          <strong className="block mb-1">{info.title}</strong>
          <p className="leading-relaxed opacity-90">{info.description}</p>
        </div>
      )}
    </div>
  );
}
