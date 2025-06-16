import {GithubConfig} from './GithubConfig';
import {HostedZoneValue} from './HostedZoneValue';
import {ServiceConfig} from './ServiceConfig';


export interface Config {
  aws: {
    account: string,
    region: string,
  },
  defaultHostedZone: HostedZoneValue
  github: GithubConfig,
  services: ServiceConfig[]
}
