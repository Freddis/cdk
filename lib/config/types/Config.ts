import {GithubConfig} from './GithubConfig';
import {ServiceConfig} from './ServiceConfig';


export interface Config {
  aws: {
    account: string,
    region: string,
  },
  github: GithubConfig,
   services: ServiceConfig[]
}
