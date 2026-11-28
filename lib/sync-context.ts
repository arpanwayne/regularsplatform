import { AsyncLocalStorage } from "async_hooks";

/**
 * Writes made while applying the other app's sync (Loopdesk ⇄ Regulars) run
 * inside withoutSync, so lib/prisma.ts doesn't mark them for sending back.
 */
const store = new AsyncLocalStorage<boolean>();
export const withoutSync = <T>(fn: () => Promise<T>) => store.run(true, fn);
export const syncSuppressed = () => store.getStore() === true;
