import { Pool, PoolClient, QueryResult } from "pg";

export class BaseService {
  protected pool?: Pool;
  protected client?: PoolClient;

  // pass in client to perform scoped transactions
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    if (!pool && !client) {
      throw new Error("Either pool or client must be provided");
    }

    this.pool = pool;
    this.client = client;
  }

  public async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const queryExecutor = this.client || this.pool;
    if (!queryExecutor) {
      throw new Error("No query executor available");
    }

    const result = await queryExecutor.query<T>(sql, params);

    return result;
  }

  public getPool(): Pool | undefined {
    return this.pool;
  }
}
