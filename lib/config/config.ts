import {Cpu} from '../types/Cpu';
import {Memory} from '../types/Memory';
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
  databases: {
    postgres: true,
    mysql: false,
  },
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
        cpu: Cpu.x0_5,
        memory: Memory.x1,
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
      aws: {
        s3: {
          bucketNames: [
            'gymtracker-images-23',
          ],
        },
        ses: {
          mailboxes: [
            'noreply@alex-sarychev.com',
          ],
        },
        envVariables: {
          NODE_ENV: 'production',
          APP_BASE_URL: 'https://discipline.alex-sarychev.com',
          EMAIL_FROM: 'noreply@alex-sarychev.com',
          EMAIL_FROM_NAME: 'Discipline Tracker',
          C0R_API_KEY: '', // create secret when needed
        },
        secrets: [
          {
            secretName: 'DisciplineFatsecretCredentials',
            envMapings: {
              deviceId: 'FATSECRET_DEVICE_IDENTIFIER',
              username: 'FATSECRET_USERNAME',
              password: 'FATSECRET_PASSWORD',
            },
          },
          {
            secretName: 'DisciplineAuthSettings',
            envMapings: {
              passwordSaltRounds: 'SERVICES_AUTH_HASH_SALT',
              jwtSecret: 'SERVICES_AUTH_JWT_SECRET',
            },
          },
        ],
      },
    },
    // {
    //   name: 'Circuits',
    //   type: ServiceType.NodeJs,
    //   github: {
    //     repo: 'logic-processor',
    //     branch: 'production',
    //   },
    //   database: {
    //     type: DbType.Postgres,
    //     database: 'circuits',
    //     user: 'circuits',
    //   },
    //   container: {
    //     port: 3000,
    //     entrypoint: 'npm',
    //     cmd: ['run', 'start'],
    //     listenerPriority: 20,
    //   },
    //   domains: [
    //     {
    //       domain: HostedZoneValue.AlexSarychev,
    //       subdomain: 'circuits',
    //     },
    //   ],
    // },
    {
      name: 'HomeStudio',
      type: ServiceType.PhpWebsite,
      github: {
        repo: 'homestudio',
        branch: 'production',
      },
      database: {
        type: DbType.Postgres,
        database: 'homestudio',
        user: 'homestudio',
      },
      container: {
        port: 3000,
        listenerPriority: 30,
      },
      domains: [
        {
          domain: HostedZoneValue.HomeStudio,
        },
      ],
    },
    {
      name: 'AlexSarychev',
      type: ServiceType.NodeJs,
      github: {
        repo: 'cv',
        branch: 'production',
      },
      database: {
        type: DbType.Postgres,
        database: 'alex_sarychev',
        user: 'alex_sarychev',
      },
      container: {
        port: 3000,
        listenerPriority: 40,
        entrypoint: 'npm',
        cmd: ['run', 'start'],
      },
      domains: [{
        domain: HostedZoneValue.AlexSarychev,
      }],
    },
  ],
};
