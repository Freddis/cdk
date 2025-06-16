import {Config} from './types/Config';
import {DbType} from './types/DbType';
import {HostedZoneValue} from './types/HostedZoneValue';
import {ServiceType} from './types/ServiceType';

export const config: Config = {
  aws: {
    region: 'eu-central-1',
    account: '243637693468',
  },
  github: {
    connectionArn: 'arn:aws:codeconnections:eu-central-1:243637693468:connection/5f03c120-8828-4a98-92d5-20fde7092e80',
    owner: 'Freddis',
  },
  defaultHostedZone: HostedZoneValue.AlexSarychev,
  services: [
    {
      name: 'Discipline',
      type: ServiceType.NodeJs,
      github: {
        repo: 'gym-tracker-web',
        branch: 'production',
      },
      database: {
        type: DbType.Postgres,
        database: 'discipline',
        user: 'discipline',
      },
      container: {
        port: 3000,
        entrypoint: 'npm',
        cmd: ['run', 'start'],
        listenerPriority: 10,
      },
      domains: [
        {
          domain: HostedZoneValue.AlexSarychev,
          subdomain: 'discipline',
        },
      ],
    },
    {
      name: 'Circuits',
      type: ServiceType.NodeJs,
      github: {
        repo: 'logic-processor',
        branch: 'production',
      },
      database: {
        type: DbType.Postgres,
        database: 'circuits',
        user: 'circuits',
      },
      container: {
        port: 3000,
        entrypoint: 'npm',
        cmd: ['run', 'start'],
        listenerPriority: 20,
      },
      domains: [
        {
          domain: HostedZoneValue.AlexSarychev,
          subdomain: 'circuits',
        },
      ],
    },
    {
      name: 'HomeStudio',
      type: ServiceType.PhpWebsite,
      github: {
        repo: 'homestudio',
        branch: 'production',
      },
      database: {
        type: DbType.MariaDb,
        database: 'homestudio',
        user: 'homestudio',
      },
      container: {
        port: 3000,
        listenerPriority: 30,
      },
      domains: [
        {
          domain: HostedZoneValue.AlexSarychev,
          subdomain: 'homestudio',
        },
      ],
    },
  ],
};
