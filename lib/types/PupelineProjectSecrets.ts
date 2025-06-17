import {ISecret} from 'aws-cdk-lib/aws-secretsmanager';

export type PupelineProjectSecrets<T extends string> = {
  [key in T]: ISecret
}
