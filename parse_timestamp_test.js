const getMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.getTime === 'function') return ts.getTime();
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (typeof ts === 'number') return ts;
  return 0;
};
console.log("ready");
