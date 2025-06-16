#!/usr/bin/env node
import {InfrastructureStack} from '../lib/InfrastructureStack';
import {App, Stack} from 'aws-cdk-lib';
import {config} from '../lib/config/config';
import {ApplicationStack} from '../lib/ApplicationStack';
import {ApplicationStackProps} from '../lib/types/ApplicationStackProps';

const root = new App();
export const infrastructure = new InfrastructureStack(root, {
  env: config.aws,
  defaultHostedZone: config.defaultHostedZone,
});
const services: Stack[] = []; // pleasing eslint
for (const serviceConfig of config.services) {
  const applicationProps: ApplicationStackProps = {
    service: serviceConfig,
    aws: config.aws,
    infrastructureStack: infrastructure,
    github: config.github,
  };
  const stack = new ApplicationStack(root, applicationProps);
  services.push(stack);
}

root.synth();
