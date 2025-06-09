import {Environment} from 'aws-cdk-lib';
import {ServiceConfig} from '../config/types/ServiceConfig';
import {InfrastructureStack} from '../InfrastructureStack';
import {GithubConfig} from '../config/types/GithubConfig';

export interface ApplicationStackProps {
  service: ServiceConfig
  aws: Environment
  infrastructureStack: InfrastructureStack
  github: GithubConfig
}
