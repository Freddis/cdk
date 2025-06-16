import {Secret as EcsSecret} from 'aws-cdk-lib/aws-ecs';
import {Secret} from 'aws-cdk-lib/aws-secretsmanager';

export interface DbUser {
  getPort(): number
  getUserNameSecretPath(): string
  getPasswordSecretPath(): string
  getDatabaseSecretPath(): string
  getHostSecretPath(): string
  getUserNameEcsSecret(): EcsSecret
  getPasswordEcsSecret(): EcsSecret
  getDatabaseEcsSecret(): EcsSecret
  getHostEcsSecret(): EcsSecret
  getSecret(): Secret
}
