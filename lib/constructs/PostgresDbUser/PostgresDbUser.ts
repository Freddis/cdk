import {Secret} from 'aws-cdk-lib/aws-secretsmanager';
import {Secret as EcsSecret} from 'aws-cdk-lib/aws-ecs';
import {Construct} from 'constructs';
import {Runtime} from 'aws-cdk-lib/aws-lambda';
import {CustomResource, Duration} from 'aws-cdk-lib';
import {Provider} from 'aws-cdk-lib/custom-resources';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {join} from 'path';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import {DatabaseUserProps} from './types/DatabaseUserProps';
import {DbUserSecretFields} from './types/DbUserSecretFields';

export class PostgresDbUser extends Construct {
  public readonly secret: Secret;
  protected secretName: string;

  constructor(scope: Construct, id: string, props: DatabaseUserProps) {
    super(scope, id);
    this.secretName = props.secretName;
    this.secret = new Secret(this, 'DatabaseUserSecret', {
      secretName: props.secretName,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          [DbUserSecretFields.User]: props.username,
          [DbUserSecretFields.Database]: props.database,
          [DbUserSecretFields.Host]: props.dbInstance.instanceEndpoint.hostname,
        }),
        generateStringKey: DbUserSecretFields.Password,
        excludeCharacters: '"@/\\',
        excludePunctuation: true,
      },
    });

    const handler = new NodejsFunction(this, 'DatabaseUserLambdaFunction', {
      functionName: `${props.service}PostgresDbUserCreate`,
      runtime: Runtime.NODEJS_18_X,
      entry: join(__dirname, 'postgres-user-lambda/index.ts'),
      environment: {
        DB_SECRET_ARN: props.dbInstance.secret!.secretArn,
        APP_USER_SECRET_ARN: this.secret.secretArn,
        DB_ENDPOINT: props.dbInstance.dbInstanceEndpointAddress,
        DB_NAME: props.database,
        PERMISSIONS: props.permissions.join(','),
      },
      timeout: Duration.seconds(30),
      bundling: {
        externalModules: ['pg-native'],
      },
      depsLockFilePath: 'package-lock.json',
    });

    // permissions
    props.dbInstance.secret?.grantRead(handler);
    this.secret.grantRead(handler);
    handler.addToRolePolicy(new PolicyStatement({
      actions: ['rds-db:connect'],
      resources: [props.dbInstance.instanceArn],
    }));

    // trigger
    const provider = new Provider(this, 'Provider', {
      onEventHandler: handler,
    });

    // force update on every deploy
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const resource = new CustomResource(this, 'CustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        timestamp: new Date().toISOString(),
      },
    });
  }
  getPort(): number {
    return 5432;
  }
  getUserNameSecretPath(): string {
    return `${this.secretName}:${DbUserSecretFields.User}`;
  }
  getPasswordSecretPath(): string {
    return `${this.secretName}:${DbUserSecretFields.Password}`;
  }
  getDatabaseSecretPath(): string {
    return `${this.secretName}:${DbUserSecretFields.Database}`;
  }
  getHostSecretPath(): string {
    return `${this.secretName}:${DbUserSecretFields.Host}`;
  }
  getUserNameEcsSecret(): EcsSecret {
    return EcsSecret.fromSecretsManager(this.secret, DbUserSecretFields.User);
  }
  getPasswordEcsSecret(): EcsSecret {
    return EcsSecret.fromSecretsManager(this.secret, DbUserSecretFields.Password);
  }
  getDatabaseEcsSecret(): EcsSecret {
    return EcsSecret.fromSecretsManager(this.secret, DbUserSecretFields.Database);
  }
  getHostEcsSecret(): EcsSecret {
    return EcsSecret.fromSecretsManager(this.secret, DbUserSecretFields.Host);
  }
  getSecret(): Secret {
    return this.secret;
  }
}
