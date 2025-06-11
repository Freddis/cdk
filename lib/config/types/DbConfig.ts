import {DbType} from './DbType';

export interface DbConfig {
  type: DbType,
  database: string,
  user: string,
}
