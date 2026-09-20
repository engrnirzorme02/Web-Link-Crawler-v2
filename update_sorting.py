import re

# Update App.tsx
with open('src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { cn, truncateForFirestore } from './lib/utils';", "import { cn, truncateForFirestore, getMillis } from './lib/utils';")

sorting_old = """      // Sort on client side to avoid needing a composite index
      loadedSessions.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });"""

sorting_new = """      // Sort on client side to avoid needing a composite index
      loadedSessions.sort((a, b) => {
        const timeA = getMillis(a.createdAt);
        const timeB = getMillis(b.createdAt);
        return timeB - timeA;
      });"""

content = content.replace(sorting_old, sorting_new)

with open('src/App.tsx', 'w') as f:
    f.write(content)

# Update HistoryDashboard.tsx
with open('src/components/HistoryDashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { formatDistanceToNow } from 'date-fns';", "import { formatDistanceToNow } from 'date-fns';\nimport { getMillis } from '../lib/utils';")

sorting_old2 = """              {historySessions.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
              }).map(session => ("""

sorting_new2 = """              {historySessions.sort((a, b) => {
                const timeA = getMillis(a.createdAt);
                const timeB = getMillis(b.createdAt);
                return timeB - timeA;
              }).map(session => ("""

content = content.replace(sorting_old2, sorting_new2)

with open('src/components/HistoryDashboard.tsx', 'w') as f:
    f.write(content)

