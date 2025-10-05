import {DbConfig} from './DbConfig';
import {DomainConfig} from './DomanConfig';
import {ServiceType} from './ServiceType';

export interface ServiceConfig {
  name: string,
  type: ServiceType,
  github: {
    repo: string,
    branch: string,
  },
  aws?: {
    s3?: {
      bucketNames: string[]
    }
    ses?: {
      mailboxes: string[]
    }
  },
  database: DbConfig,
  container: {
    port: number,
    listenerPriority: number,
    entrypoint?: string,
    cmd?: string[],
  },
  domains: DomainConfig[],
}
