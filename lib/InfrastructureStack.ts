import {Stack, StackProps} from 'aws-cdk-lib';
import {InstanceClass, InstanceSize, InstanceType, IVpc, Peer, Port, SecurityGroup, Vpc} from 'aws-cdk-lib/aws-ec2';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  DatabaseInstanceProps,
  DatabaseSecret,
  MariaDbEngineVersion,
  PostgresEngineVersion} from 'aws-cdk-lib/aws-rds';
import {Construct} from 'constructs';
import {Cluster} from 'aws-cdk-lib/aws-ecs';
import {ApplicationLoadBalancer} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {uppercaseFirst} from './utils/strings';
import {DbType} from './config/types/DbType';

export class InfrastructureStack extends Stack {
  protected postgres: DatabaseInstance;
  protected mysql: DatabaseInstance;
  protected ecsCluster: Cluster;
  protected loadBalancer: ApplicationLoadBalancer;
  protected vpc: IVpc;

  constructor(scope: Construct, props?: StackProps) {
    super(scope, 'Infrastructure', {
      ...props,
      stackName: 'Infrastructure',
      description: 'Global shared infrastructure such as clusters, databases, load balancers',
    });
    this.vpc = Vpc.fromLookup(this, 'CloudPrimary', {
      isDefault: true,
    });
    this.postgres = this.createDb(this.vpc, DbType.Postgres);
    this.mysql = this.createDb(this.vpc, DbType.MariaDb);
    this.ecsCluster = this.createEcsCluster(this.vpc);
    this.loadBalancer = this.createElasticLoadBalancer(this.vpc);
  }

  getEcsCluster(): Cluster {
    return this.ecsCluster;
  }
  getPostgresDb(): DatabaseInstance {
    return this.postgres;
  }
  getMysqlDb(): DatabaseInstance {
    return this.mysql;
  }
  getLoadBalancer(): ApplicationLoadBalancer {
    return this.loadBalancer;
  }
  getVpc(): IVpc {
    return this.vpc;
  }
  protected createElasticLoadBalancer(vpc: IVpc): ApplicationLoadBalancer {
    const sg = new SecurityGroup(this, 'SecurityGroupLoadBalancerPrimary', {
      securityGroupName: 'load-balancer-primary',
      vpc,
    });
    const lb = new ApplicationLoadBalancer(this, 'LoadBalancerPrimary', {
      vpc,
      internetFacing: true,
      securityGroup: sg,
      loadBalancerName: 'Primary',
    });
    return lb;
  }
  protected createEcsCluster(vpc: IVpc): Cluster {
    const cluster = new Cluster(this, 'EcsClusterPrimary', {
      clusterName: 'Primary',
      vpc: vpc,
    });
    return cluster;
  }


  protected createDb(vpc: IVpc, dbType: DbType): DatabaseInstance {
    type AllowedEngineTypes = typeof DatabaseInstanceEngine.MARIADB | typeof DatabaseInstanceEngine.POSTGRES;
    const portMap: Record<DbType, Port> = {
      [DbType.Postgres]: Port.POSTGRES,
      [DbType.MariaDb]: Port.MYSQL_AURORA,
    };
    const engineMap: Record<DbType, AllowedEngineTypes> = {
      [DbType.Postgres]: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_17_5,
      }),
      [DbType.MariaDb]: DatabaseInstanceEngine.mariaDb({
        version: MariaDbEngineVersion.VER_10_11_11,
      }),
    };
    const dbTypeKey = dbType.toString();
    const creds = new DatabaseSecret(this, `Secret${uppercaseFirst(dbTypeKey)}PrimaryRootUser`, {
      secretName: `${uppercaseFirst(dbTypeKey)}PrimaryRootUser`,
      username: `${dbTypeKey.toLowerCase()}_root`,
    });
    const dbSercurityGroup = new SecurityGroup(this, `SecurityGroup${uppercaseFirst(dbTypeKey)}Primary`, {
      vpc,
      description: `Security group for primary ${dbTypeKey.toLowerCase()} instance`,
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      securityGroupName: `${dbTypeKey.toLowerCase()}-primary`,
    });
    dbSercurityGroup.addIngressRule(Peer.anyIpv4(), portMap[dbType], `Allow everyone inside for ${dbTypeKey.toLowerCase()}`);
    dbSercurityGroup.addIngressRule(Peer.anyIpv6(), portMap[dbType], `Allow everyone inside for ${dbTypeKey.toLowerCase()}`);
    const dbProps: DatabaseInstanceProps = {
      engine: engineMap[dbType],
      credentials: Credentials.fromSecret(creds),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      vpc: vpc,
      publiclyAccessible: true,
      vpcSubnets: vpc,
      securityGroups: [dbSercurityGroup],
    };
    const db = new DatabaseInstance(this, `${uppercaseFirst(dbTypeKey)}Primary`, dbProps);
    return db;
  }
}
