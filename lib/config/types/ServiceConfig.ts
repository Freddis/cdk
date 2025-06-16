import {DbConfig} from './DbConfig';
import {DomainConfig} from './DomanConfig';

export interface ServiceConfig {
  name: string,
  github: {
    repo: string,
    branch: string,
  },
  database: DbConfig,
  container: {
    port: number,
    listenerPriority: number,
    entrypoint: string,
    cmd: string[],
  },
  domains: DomainConfig[],
}
