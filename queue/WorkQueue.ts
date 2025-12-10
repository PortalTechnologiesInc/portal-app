import { DatabaseService, QueuedTaskRecord, toUnixSeconds } from "@/services/DatabaseService";
import { PortalAppInterface } from "portal-app-lib";
import { Sha256 } from '@aws-crypto/sha256-js';

type Expiry = Date | 'forever';
type Waiter<T> = (result: T | null, error: any) => void;

const locksMap = new Map<string, Promise<any>>();
const waitersMap = new Map<number, Waiter<any>>();

export abstract class Arguments<TArgs extends unknown[] = unknown[]> {
  constructor(protected readonly args: TArgs) {}

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
    const flattenObject = function(ob: any) {
      const toReturn: Record<string, any> = {};
      for (const i in ob) {
        if (!ob.hasOwnProperty(i)) continue;
        
        if ((typeof ob[i]) == 'object') {
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
    const jsonArgs = JSON.stringify(flattenedArgs, (_, v) => {
      if (typeof v === 'function') {
        return null;
      } else if (typeof v === 'bigint') {
        return `BigInt(${v.toString()})`;
      } else {
        return v;
      }
    });
    const hash = new Sha256();
    hash.update(jsonArgs);
    const result = hash.digestSync();
    return result.toString();
  }
}

export abstract class Task<A extends unknown[], P extends unknown[], T> {
  private static registry = new Map<string, TaskConstructor<unknown[], unknown[], unknown>>();

  private readonly db: DatabaseService;
  protected readonly args: Arguments<A>;
  protected readonly providers: P;
  protected expiry: Expiry = 'forever';

  constructor(args: Arguments<A> | A, readonly providerNames: string[], private readonly fn: (providers: P, ...args: A) => Promise<T>) {
    if (args instanceof Arguments) {
      this.args = args;
    } else {
      this.args = new JsonArguments(args);
    }

    const db = ProviderRepository.get<DatabaseService>('DatabaseService');
    if (!db) {
      throw new Error('DatabaseService not found');
    }
    this.db = db;

    const providers = this.providerNames.map(name => {
      const provider = ProviderRepository.get(name);
      if (!provider) {
        throw new Error(`Provider ${name} not found`);
      }
      return provider;
    });
    this.providers = providers as P;
  }

  async run(): Promise<T> {
    const key = `${this.constructor.name}:${this.args.hash()}`;
    const cached = await this.db.getCache(key);
    if (cached) {
      console.warn(`Cache hit for ${key}: ${cached}`);
      return JSON.parse(cached);
    }

    try {
      // FIXME: this suffers from race conditions, we should use a "get or insert" atomic operation instead but TypeScript maps don't support this
      const lock = locksMap.get(key);
      if (lock) {
        return await lock;
      } else {
        // await this.db.beginTransaction();
        const promise = this.fn(this.providers, ...this.args.values());
        locksMap.set(key, promise);
        try {
          const data = await promise;
          await this.db.setCache(key, JSON.stringify(data), this.expiry);
          return data;
        } finally {
          // await this.db.commitTransaction();
          locksMap.delete(key);
        }
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  serialize(): QueuedTaskRecord {
    return {
      id: 0,
      task_name: this.constructor.name,
      arguments: JSON.stringify(this.args.values(), (_, v) => {
        if (typeof v === 'function') {
          return null;
        } else if (typeof v === 'bigint') {
          return `BigInt(${v.toString()})`;
        } else {
          return v;
        }
      }),
      added_at: toUnixSeconds(Date.now()),
      expires_at: this.expiry === 'forever' ? null : this.expiry.getTime(),
      priority: 0,
    };
  }

  static register<A extends unknown[], P extends unknown[], T>(instance: new (...args: any[]) => Task<A, P, T>) {
    Task.registry.set(instance.name, instance as TaskConstructor<any[], any, any>);
  }

  static getFromRegistry(name: string): TaskConstructor<unknown[], unknown[], unknown> | undefined {
    return Task.registry.get(name);
  }

  static deserialize(serialized: QueuedTaskRecord): Task<any[], any, any> {

    const constructor = Task.getFromRegistry(serialized.task_name);
    if (!constructor) {
      throw new Error(`Task constructor not found: ${serialized.task_name}`);
    }
    return new constructor(...JSON.parse(serialized.arguments, (key, value) => {
      if (typeof value === 'string' && value.startsWith('BigInt(')) {
        return BigInt(value.slice(7, -1));
      } else {
        return value;
      }
    }));
  }
}

export type TaskConstructor<A extends unknown[] = unknown[], P extends unknown[] = unknown[], T = unknown> = new (...args: any[]) => Task<A, P, T>;

export interface DefaultProviders {
  db: DatabaseService;
  portal: PortalAppInterface;
}

export class ProviderRepository {
  private static providers = new Map<string, any>();

  static register(provider: any, name?: string) {
    console.warn('Registering provider', name || provider.constructor.name);
    ProviderRepository.providers.set(name || provider.constructor.name, provider);
  }

  static get<T>(type: string): T | undefined {
    return ProviderRepository.providers.get(type) as T;
  }
}

async function runTask(db: DatabaseService, record: QueuedTaskRecord): Promise<any> {
  try {
    const task = Task.deserialize(record);
    const result = await task.run();
    await db.deleteQueuedTask(record.id);
    return result;
  } catch (error) {
    console.error('Error running task:', error);
    await db.deleteQueuedTask(record.id);
    throw error;
  }
}

export async function processQueue() {
  const db = ProviderRepository.get<DatabaseService>('DatabaseService');
  if (!db) {
    throw new Error('DatabaseService not found');
  }

  // const tasks = await db.getQueuedTasks({ excludeExpired: false });
  // for (const task of tasks) {
  //   // await db.deleteQueuedTask(task.id);
  //   console.warn('debug task:', task);
  // }

  while (true) {
    const record = await db.extractNextQueuedTask();
    console.log('Extracted task from queue', record);
    if (!record) {
      break;
    }

    await runTask(db, record);
 }
}

export async function enqueueTask<T>(task: Task<any[], any, T>): Promise<T> {
  const db = ProviderRepository.get<DatabaseService>('DatabaseService');
  if (!db) {
    throw new Error('DatabaseService not found');
  }

  const record = task.serialize();
  const id = await db.addQueuedTask(record.task_name, record.arguments, record.expires_at, record.priority);
  console.log('Added task to queue', id);

  return await runTask(db, record);
}