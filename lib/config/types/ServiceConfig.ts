import {Cpu} from '../../types/Cpu';
import {Memory} from '../../types/Memory';
import {DbConfig} from './DbConfig';
import {DomainConfig} from './DomanConfig';
import {ServiceType} from './ServiceType';

export interface SecretConfig {
  secretName: string,
  envMapings: Record<string, string>
}

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
    secrets?: SecretConfig[]
    envVariables?: Record<string, string>
  },
  database?: DbConfig,
  container: {
    cpu?: Cpu,
    memory?: Memory,
    port: number,
    listenerPriority: number,
    entrypoint?: string,
    cmd?: string[],
  },
  domains: DomainConfig[],
}
