import {Stack, StackProps} from 'aws-cdk-lib';
import {InstanceClass, InstanceSize, InstanceType, IVpc, Peer, Port, SecurityGroup, Vpc} from 'aws-cdk-lib/aws-ec2';
import {Credentials, DatabaseInstance, DatabaseInstanceEngine, DatabaseInstanceProps, DatabaseSecret} from 'aws-cdk-lib/aws-rds';
import {Construct} from 'constructs';
import {SecretName} from './types/SecretName';
import {Cluster} from 'aws-cdk-lib/aws-ecs';
import {ApplicationListener, ApplicationLoadBalancer} from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class InfrastructureStack extends Stack {
  protected postgres: DatabaseInstance;
  protected ecsCluster: Cluster;
  protected loadBalancer: ApplicationLoadBalancer;
  protected vpc: IVpc;
  protected loadBalancerHttpsListener: ApplicationListener;

  constructor(scope: Construct, props?: StackProps) {
    super(scope, 'Infrastructure', {
      ...props,
      stackName: 'Infrastructure',
    });
    this.vpc = Vpc.fromLookup(this, 'CloudPrimary', {
      isDefault: true,
    });
    this.postgres = this.createDb(this.vpc);
    this.ecsCluster = this.createEcsCluster(this.vpc);
    this.loadBalancer = this.createElasticLoadBalancer(this.vpc);
  }

  getEcsCluster(): Cluster {
    return this.ecsCluster;
  }
  getPostgresDb(): DatabaseInstance {
    return this.postgres;
  }
  getLoadBalancer(): ApplicationLoadBalancer {
    return this.loadBalancer;
  }
  getLoadBalancerHttpsListener() {
    return this.loadBalancerHttpsListener;
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

  protected createDb(vpc: IVpc): DatabaseInstance {
    const creds = new DatabaseSecret(this, 'SecretPostgresPrimaryRootUser', {
      secretName: SecretName.PostgresPrimaryRootUser,
      username: 'postgres_root',
    });
    const dbSercurityGroup = new SecurityGroup(this, 'SecurityGroupPostgresPrimary', {
      vpc,
      description: 'Security group for primary postgres instance',
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      securityGroupName: 'postgres-primary',
    });
    dbSercurityGroup.addIngressRule(Peer.anyIpv4(), Port.POSTGRES, 'Allow everyone inside for postgres');
    dbSercurityGroup.addIngressRule(Peer.anyIpv6(), Port.POSTGRES, 'Allow everyone inside for postgres');
    const dbProps: DatabaseInstanceProps = {
      engine: DatabaseInstanceEngine.POSTGRES,
      credentials: Credentials.fromSecret(creds),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      vpc: vpc,
      publiclyAccessible: true,
      vpcSubnets: vpc,
      securityGroups: [dbSercurityGroup],
    };
    const db = new DatabaseInstance(this, 'PosgresPrimary', dbProps);
    return db;
  }
}
