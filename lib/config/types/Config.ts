import {GithubConfig} from './GithubConfig';
import {HostedZoneValue} from './HostedZoneValue';
import {ServiceConfig} from './ServiceConfig';

export interface DatabasesConfig {
  postgres: boolean,
  mysql: boolean,
}

export interface Config {
  aws: {
    account: string,
    region: string,
  },
  defaultHostedZone: HostedZoneValue
  github: GithubConfig,
  databases: DatabasesConfig,
  services: ServiceConfig[]
}
