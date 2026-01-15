import { DatabaseService, QueuedTaskRecord, toUnixSeconds } from "@/services/DatabaseService";
import { PortalAppInterface, CalendarInterface, parseCalendar } from "portal-app-lib";
import { Sha256 } from '@aws-crypto/sha256-js';
import { GlobalProviders } from "./Providers";

type Expiry = Date | 'forever';
type Waiter<T> = (result: T | null, error: any) => void;

const locksMap = new Map<string, Promise<any>>();
const waitersMap = new Map<number, Waiter<any>>();

export abstract class Arguments<TArgs extends unknown[] = unknown[]> {
  constructor(protected readonly args: TArgs) { }

  abstract hash(): string;

  values(): TArgs {
    return this.args;
  }

  equals(other: Arguments<TArgs>): boolean {
    return this.hash() === other.hash();
  }
}

export class JsonArguments<TArgs extends unknown[] = unknown[]> extends Arguments<TArgs> {
  constructor(args: TArgs) {
    super(args);
  }

  hash(): string {
    const flattenObject = function (ob: any) {
      const toReturn: Record<string, any> = {};
      for (const i in ob) {
        if (!ob.hasOwnProperty(i)) continue;
        
        if ((typeof ob[i]) === 'object') {
          var flatObject = flattenObject(ob[i]);
          for (var x in flatObject) {
            if (!flatObject.hasOwnProperty(x)) continue;

            toReturn[i + '.' + x] = flatObject[x];
          }
        } else {
          toReturn[i] = ob[i];
        }
      }
      return toReturn;
    };
    const flattenedArgs = flattenObject(this.args);
    const jsonArgs = JSON.stringify(flattenedArgs, (k, v) => {
      if (typeof v === 'function') {
        throw new Error(`Function ${k} is not serializable`);
      } else if (typeof v === 'bigint') {
        return `${v.toString()}n`;
      } else {
        return v;
      }
    });
    const hash = new Sha256();
    hash.update(jsonArgs);
    const result = hash.digestSync();
    return Array.from(result).map((b) => b.toString(16).padStart(2, "0")).join("")
  }
}

function serializeValue(v: any): string {
  return JSON.stringify(v, (k, v) => {
    if (typeof v === 'function') {
      throw new Error(`Function ${k} is not serializable`);
    } else if (typeof v === 'bigint') {
      return `${v.toString()}n`;
    } else if (isCalendarInterface(v)) {
      return `CalendarInterface(${v.toCalendarString()})`;
    } else {
      return v;
    }
  })
}

function deserializeValue(v: string): any {
  return JSON.parse(v, (_, value) => {
    if (typeof value === 'string' && value.endsWith('n') && value.length <= 32 && !isNaN(Number(value.slice(0, -1)))) {
      return BigInt(value.slice(0, -1));
    } else if (typeof value === 'string' && value.startsWith('CalendarInterface(')) {
      return parseCalendar(value.slice(18, -1));
    } else {
      return value;
    }
  })
}

type GlobalProviderNames = GlobalProviders['name'];

type ProvidersSubset<N extends GlobalProviderNames[]> = {
  [K in GlobalProviderNames]: K extends N[number] ? Extract<GlobalProviders, { name: K }>['type'] : never;
}

export abstract class Task<A extends unknown[], P extends GlobalProviderNames[], T> {
  private static registry = new Map<string, TaskConstructor<unknown[], GlobalProviderNames[], unknown>>();

  private readonly db: DatabaseService;
  protected readonly args: Arguments<A>;
  protected expiry: Expiry = 'forever';

  constructor(private readonly providerNames: P, ...args: A) {
    this.args = new JsonArguments(args);

    const db = ProviderRepository.get('DatabaseService');
    if (!db) {
      throw new Error('DatabaseService not found');
    }
    this.db = db;
  }

  abstract taskLogic(providers: ProvidersSubset<P>, ...args: A): Promise<T>;

  async run(): Promise<T> {
    const providers: Partial<Record<GlobalProviderNames, any>> = {};
    for (const name of this.providerNames) {
      const provider = ProviderRepository.get(name);
      if (!provider) {
        throw new Error(`Provider ${name} not found`);
      }
      providers[name] = provider;
    }

    const key = `${this.constructor.name}${this.args.hash()}`;
    const cached = await this.db.getCache(key);
    if (cached) {
      console.warn(`Cache hit for ${key}: ${cached}`);
      return deserializeValue(cached);
    }

    try {
      // FIXME: this suffers from race conditions, we should use a "get or insert" atomic operation instead but TypeScript maps don't support this
      const lock = locksMap.get(key);
      if (lock) {
        return await lock;
      } else {
        if (this instanceof TransactionalTask) {
          // console.warn('Beginning transaction', key);
          await this.db.startSavepoint(key);
        }

        const promise = this.taskLogic(providers as ProvidersSubset<P>, ...this.args.values());
        locksMap.set(key, promise);

        const data = await promise;
        await this.db.setCache(key, serializeValue(data), this.expiry);
        
        if (this instanceof TransactionalTask) {
          // console.warn('Committing transaction', key);
          await this.db.releaseSavepoint(key);
        }
        locksMap.delete(key);

        return data;
      }
    } catch (error) {
      console.log(error);

      if (this instanceof TransactionalTask) {
        // console.warn('Rolling back transaction', key);
        await this.db.rollbackSavepoint(key);
      }
      locksMap.delete(key);

      throw error;
    }
  }

  serialize(): QueuedTaskRecord {
    return {
      id: 0,
      task_name: this.constructor.name,
      arguments: serializeValue(this.args.values()),
      added_at: toUnixSeconds(Date.now()),
      expires_at: this.expiry === 'forever' ? null : this.expiry.getTime(),
      priority: 0,
    };
  }

  static register<A extends unknown[], P extends GlobalProviderNames[], T>(instance: new (...args: any[]) => Task<A, P, T>) {
    Task.registry.set(instance.name, instance as TaskConstructor<any[], any, any>);
  }

  static getFromRegistry(name: string): TaskConstructor<unknown[], GlobalProviderNames[], unknown> | undefined {
    return Task.registry.get(name);
  }

  static deserialize(serialized: QueuedTaskRecord): Task<any[], any, any> {
    const constructor = Task.getFromRegistry(serialized.task_name);
    if (!constructor) {
      throw new Error(`Task constructor not found: ${serialized.task_name}`);
    }
    return new constructor(...deserializeValue(serialized.arguments));
  }
}

/**
 * TransactionalTask is a Task that runs in a sqlite transaction.
 * 
 * It should only be used for tasks that modify the database. If a task is spawned internally that also modifies the database,
 * its changes and cache will not be committed until the "root" transactiona tasks completes.
 * 
 * Also note that the transaction will keep an exclusive lock on the database for the duration of the task,
 * so this should only be done for tasks that complete fairly quickly.
 */
export abstract class TransactionalTask<A extends unknown[], P extends GlobalProviderNames[], T> extends Task<A, P, T> {}

export type TaskConstructor<A extends unknown[] = unknown[], P extends GlobalProviderNames[] = GlobalProviderNames[], T = unknown> = new (...args: any[]) => Task<A, P, T>;

export class ProviderRepository {
  private static providers = new Map<GlobalProviderNames, any>();

  static register<N extends GlobalProviderNames>(provider: Extract<GlobalProviders, { name: N }>['type'], name: N) {
    console.warn('Registering provider', name);
    ProviderRepository.providers.set(name, provider);
  }

  static get<N extends GlobalProviderNames>(type: N): ProvidersSubset<[N]>[N] | undefined {
    return ProviderRepository.providers.get(type) as ProvidersSubset<[N]>[N];
  }
}

async function runTask(db: DatabaseService, record: QueuedTaskRecord): Promise<any> {
  try {
    console.log('[WorkQueue] runTask called for task:', record.task_name, 'id:', record.id);
    const task = Task.deserialize(record);
    console.log('[WorkQueue] Task deserialized, starting execution');
    const result = await task.run();
    console.log('[WorkQueue] Task completed successfully:', record.task_name);
    await db.deleteQueuedTask(record.id);
    return result;
  } catch (error) {
    console.error('[WorkQueue] Error running task:', record.task_name, error);
    await db.deleteQueuedTask(record.id);
    throw error;
  }
}

/**
 * Resume tasks from the database queue.
 * 
 * Resume tasks that were spawned with `enqueueTask` and are not completed yet.
 */
export async function resumeTasks() {
  const db = ProviderRepository.get('DatabaseService');
  if (!db) {
    throw new Error('DatabaseService not found');
  }

  while (true) {
    const record = await db.extractNextQueuedTask();
    console.log('Extracted task from queue', record);
    if (!record) {
      break;
    }

    await runTask(db, record);
  }
}

/**
 * Enqueue a task to the database queue.
 * 
 * Add a task to the database queue for future resumption and immediately start its execution.
 */
export async function enqueueTask<T>(task: Task<any[], any, T>): Promise<T> {
  const db = ProviderRepository.get('DatabaseService');
  if (!db) {
    throw new Error('DatabaseService not found');
  }

  const record = task.serialize();
  console.log(record);
  const id = await db.addQueuedTask(record.task_name, record.arguments, record.expires_at, record.priority);
  console.log('[WorkQueue] Added task to queue with id:', id, 'task name:', record.task_name);

  console.log('[WorkQueue] Running task immediately');
  return await runTask(db, record);
}

// Helper function to check if a value implements CalendarInterface
function isCalendarInterface(value: unknown): value is CalendarInterface {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nextOccurrence' in value &&
    'toCalendarString' in value &&
    'toHumanReadable' in value &&
    typeof (value as any).nextOccurrence === 'function' &&
    typeof (value as any).toCalendarString === 'function' &&
    typeof (value as any).toHumanReadable === 'function'
  );
}