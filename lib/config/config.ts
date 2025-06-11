import {Config} from './types/Config';
import {DbType} from './types/DbType';
import {HostedZoneValue} from './types/HostedZoneValue';

export const config: Config = {
  aws: {
    region: 'eu-central-1',
    account: '243637693468',
  },
  github: {
    connectionArn: 'arn:aws:codeconnections:eu-central-1:243637693468:connection/5f03c120-8828-4a98-92d5-20fde7092e80',
    owner: 'Freddis',
  },
  services: [
    {
      name: 'Discipline',
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
      },
      domains: [
        {
          domain: HostedZoneValue.AlexSarychev,
          subdomain: 'discipline',
        },
      ],
    },
  ],
};
