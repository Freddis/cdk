import {DomainConfig} from './DomanConfig';

export interface ServiceConfig {
  name: string,
  github: {
    repo: string,
    branch: string,
  },
  container: {
    port: number,
    entrypoint: string,
    cmd: string[],
  },
  domains: DomainConfig[],
}
