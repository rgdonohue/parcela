import { randomUUID } from 'node:crypto';
import type { StructuredQuery } from '../../../../shared/types/query';
import { log } from '../logger';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 1000;

export interface ConversationSession {
  previousQuery: StructuredQuery | null;
  previousExplanation: string | null;
  turnCount: number;
  lastAccessedAt: Date;
}

// This is an in-memory store. It does not survive restarts. A future implementation should use Redis or a persistent store.
const sessions = new Map<string, ConversationSession>();

export function getSession(id: string): ConversationSession | null {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }
  session.lastAccessedAt = new Date();
  return session;
}

export function createSession(): string | null {
  if (sessions.size >= MAX_SESSIONS) {
    log({
      level: 'warn',
      event: 'conversation.store_full',
      conversationStoreFull: true,
      maxSessions: MAX_SESSIONS,
      sessionCount: sessions.size,
    });
    return null;
  }

  const id = randomUUID();
  sessions.set(id, {
    previousQuery: null,
    previousExplanation: null,
    turnCount: 0,
    lastAccessedAt: new Date(),
  });
  return id;
}

export function updateSession(
  id: string,
  query: StructuredQuery,
  explanation: string
): ConversationSession | null {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  session.previousQuery = query;
  session.previousExplanation = explanation;
  session.turnCount += 1;
  session.lastAccessedAt = new Date();
  return session;
}

export function pruneOldSessions(now: Date = new Date()): number {
  let pruned = 0;
  for (const [id, session] of sessions.entries()) {
    if (now.getTime() - session.lastAccessedAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
      pruned += 1;
    }
  }
  return pruned;
}

const pruneInterval = setInterval(() => {
  pruneOldSessions();
}, PRUNE_INTERVAL_MS);
pruneInterval.unref();

export function stopConversationPruneInterval(): void {
  clearInterval(pruneInterval);
}

export function __clearConversationSessionsForTests(): void {
  sessions.clear();
}
