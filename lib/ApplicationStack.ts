import {App, CfnOutput, Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {ApplicationStackProps} from './types/ApplicationStackProps';
import {Certificate, CertificateValidation} from 'aws-cdk-lib/aws-certificatemanager';
import {Pipeline, Artifact, ArtifactPath} from 'aws-cdk-lib/aws-codepipeline';
import {CodeStarConnectionsSourceAction, CodeBuildAction, EcsDeployAction} from 'aws-cdk-lib/aws-codepipeline-actions';
import {SecurityGroup, Peer, Port} from 'aws-cdk-lib/aws-ec2';
import {Repository} from 'aws-cdk-lib/aws-ecr';
import {
  FargateService,
  TaskDefinitionProps,
  Compatibility,
  CpuArchitecture,
  OperatingSystemFamily,
  TaskDefinition,
  ContainerImage,
  AwsLogDriver,
  ICluster,
  ContainerDefinitionProps,
  Secret as EcsSecret,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationProtocol,
  ApplicationListener,
  ListenerAction,
  ApplicationTargetGroup,
  ListenerCondition,
  ApplicationListenerRule,
  ApplicationListenerCertificate,
  Protocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {HostedZone, IHostedZone, ARecord, RecordTarget} from 'aws-cdk-lib/aws-route53';
import {LoadBalancerTarget} from 'aws-cdk-lib/aws-route53-targets';
import {DbType} from './config/types/DbType';
import {PostgresDbUser} from './constructs/PostgresDbUser/PostgresDbUser';
import {DockerImageAsset, Platform} from 'aws-cdk-lib/aws-ecr-assets';
import {join} from 'path';
import {DockerImageName, ECRDeployment} from 'cdk-ecr-deployment';
import {DbUser} from './types/DbUser';
import {MariaDbUser} from './constructs/MariaDbUser/MariaDbUser';
import {ServiceType} from './config/types/ServiceType';
import {BasePipelineProjectStrategy} from './types/BasePipelineProjectStrategy';
import {NodeJsPipelineProject} from './pipeline-projects/NodeJsPipelineProject';
import {PhpWebsitePipelineProject} from './pipeline-projects/PhpWebsitePipelineProject';
import {PolicyStatement, Effect, IRole} from 'aws-cdk-lib/aws-iam';
import {Bucket} from 'aws-cdk-lib/aws-s3';
import {Secret} from 'aws-cdk-lib/aws-secretsmanager';

export class ApplicationStack extends Stack {
  protected config: ApplicationStackProps;

  constructor(scope: App, config: ApplicationStackProps) {
    super(scope, config.service.name, {
      env: config.aws,
      description: `Application stack for: ${config.service.name} `,
    });
    this.config = config;
    const repo = this.createEcrRepo();
    const cluster = config.infrastructureStack.getEcsCluster();
    const httpsListener = config.infrastructureStack.getLoadBalancerHttpsListener();
    const dbUser = this.createDbUser();
    const ecsService = this.createEcsService(repo, cluster, dbUser);
    this.createCodePilene(repo, ecsService, dbUser);
    this.attachDomainsToTask(ecsService, httpsListener);
  }

  protected createEcrRepo() {
    const repo = new Repository(this, 'ContainerRepository', {
      repositoryName: this.config.service.name.toLocaleLowerCase(),
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    const asset = new DockerImageAsset(this, 'DockerDummyImage', {
      directory: join(__dirname, 'ecs-dummy-docker-container'),
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        PORT: this.config.service.container.port.toString(),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ecrDeployment = new ECRDeployment(this, 'DockerDummyImageEcrDeployment', {
      src: new DockerImageName(asset.imageUri),
      dest: new DockerImageName(`${repo.repositoryUri}:latest`),
    });
    return repo;
  }

  protected createDbUser(): DbUser | undefined {
    const map: Record<DbType, () => DbUser> = {
      [DbType.Postgres]: (): DbUser => {
        return new PostgresDbUser(this, 'PostgresDbUser', {
          service: this.config.service.name,
          secretName: `${this.config.service.name}DbUser`,
          dbInstance: this.config.infrastructureStack.getPostgresDb(),
          username: this.config.service.database.user,
          database: this.config.service.database.database,
        });
      },
      [DbType.MariaDb]: (): DbUser => {
        return new MariaDbUser(this, 'MariaDbUser', {
          service: this.config.service.name,
          secretName: `${this.config.service.name}DbUser`,
          dbInstance: this.config.infrastructureStack.getMysqlDb(),
          username: this.config.service.database.user,
          database: this.config.service.database.database,
        });
      },
    };
    const user = map[this.config.service.database.type]();
    return user;
  }

  protected attachDomainsToTask(ecsService: FargateService, httpsListener: ApplicationListener) {
    for (const domainConfig of this.config.service.domains) {
      const hostedZone = HostedZone.fromLookup(this, `HostedZone_${domainConfig.domain}`, {
        domainName: domainConfig.domain,
      });
      this.attachDomainToTask(ecsService, httpsListener, hostedZone, domainConfig.subdomain);
    }
  }

  protected attachDomainToTask(
    ecsService: FargateService,
    httpsListener: ApplicationListener,
    hostedZone: IHostedZone,
    subdomain?: string
  ) {
    const extraDomains = [
      `*.${hostedZone.zoneName}`,
    ];
    if (subdomain) {
      extraDomains.push(`*.${subdomain}.${hostedZone.zoneName}`,);
    }
    const sert = new Certificate(this, `${this.config.service.name}SslCertificate`, {
      domainName: `${hostedZone.zoneName}`,
      subjectAlternativeNames: extraDomains,
      validation: CertificateValidation.fromDns(hostedZone),
    });
    const appSert = new ApplicationListenerCertificate(this, 'LoadBalancerListenerCertificateAttachment', {
      certificates: [sert],
      listener: httpsListener,
    });
    const fullDomain = subdomain ? `${subdomain}.${hostedZone.zoneName}` : hostedZone.zoneName;
    const rule = new ApplicationListenerRule(this, 'LoadBalancerListenerRule', {
      listener: httpsListener,
      priority: this.config.service.container.listenerPriority,
      conditions: [
        ListenerCondition.hostHeaders([
          fullDomain,
        ]),
      ],
      action: ListenerAction.forward([
        new ApplicationTargetGroup(this, 'LoadBalancerListenerTargetGroup', {
          vpc: httpsListener.loadBalancer.vpc,
          port: this.config.service.container.port,
          protocol: ApplicationProtocol.HTTP,
          targets: [ecsService],
          targetGroupName: this.config.service.name,
          healthCheck: {
            path: '/',
            port: `${this.config.service.container.port}`,
            protocol: Protocol.HTTP,
            healthyThresholdCount: 3,
            unhealthyThresholdCount: 10,
            interval: Duration.seconds(20),
            timeout: Duration.seconds(5),
          },
        }),
      ]),
    });
    const dnsArecord = new ARecord(this, 'DomainARecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: RecordTarget.fromAlias(
          new LoadBalancerTarget(httpsListener.loadBalancer)
        ),
    });
    return {dnsArecord, appSert, rule};
  }

  protected createCodePilene(repo: Repository, ecsService: FargateService, dbUser?: DbUser) {
    const pipeline = new Pipeline(this, 'PipelineDeploy', {
      pipelineName: `${this.config.service.name}`,
    });
    const pullOutput = new Artifact();
    pipeline.addStage({
      stageName: 'Pull',
      actions: [
        new CodeStarConnectionsSourceAction({
          repo: this.config.service.github.repo,
          branch: this.config.service.github.branch,
          owner: this.config.github.owner,
          output: pullOutput,
          connectionArn: this.config.github.connectionArn,
          triggerOnPush: true,
          actionName: `${this.config.service.name}`,
          codeBuildCloneOutput: true,
        }),
      ],
    });

    const buildOutput = new Artifact();
    const buildSpecStrategy = this.getBuildSpec();
    const logGroup = new LogGroup(this, 'LogGroupBuild', {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `${this.config.service.name.toLocaleLowerCase()}-build`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const project = buildSpecStrategy.createProject(this.config.service.name, logGroup, repo, dbUser);
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new CodeBuildAction({
          actionName: `${this.config.service.name}`,
          input: pullOutput,
          outputs: [buildOutput],
          project,
        }),
      ],
    });
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new EcsDeployAction({
          actionName: `${this.config.service.name}`,
          service: ecsService,
          deploymentTimeout: Duration.minutes(10),
          imageFile: new ArtifactPath(buildOutput, 'imagedefinitions.json'),
        }),
      ],
    });
  }

  protected createEcsService(repo: Repository, cluster: ICluster, user?: DbUser): FargateService {
    const taskDefinitionProps: TaskDefinitionProps = {
      compatibility: Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    };
    const logGroup = new LogGroup(this, 'LogGroupTask', {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `${this.config.service.name.toLocaleLowerCase()}-task`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const taskDefinition = new TaskDefinition(this, 'TaskDefinition', taskDefinitionProps);
    const taskRole = taskDefinition.taskRole;
    if (this.config.s3BucketNames && this.config.s3BucketNames?.length > 0) {
      this.createS3Buckets(taskRole, this.config.s3BucketNames);
    }

    if (this.config.service.aws?.ses?.mailboxes && this.config.service.aws.ses.mailboxes.length > 0) {
      this.createSesConfiguration(taskRole, this.config.service.aws.ses.mailboxes);
    }

    const dbSecrets: ContainerDefinitionProps['secrets'] = {};
    if (user) {
      dbSecrets.DB_HOST = user.getHostEcsSecret();
      dbSecrets.DB_USER = user.getUserNameEcsSecret();
      dbSecrets.DB_PASSWORD = user.getPasswordEcsSecret();
      dbSecrets.DB_DATABASE = user.getDatabaseEcsSecret();
    }

    const secrets: ContainerDefinitionProps['secrets'] = {};
    for (const secretConfig of this.config.service.aws?.secrets ?? []) {
      const constSecretName = `SecretRef_${secretConfig.secretName.replace('/', '_')}`;
      // const secret = new Secret(this, constSecretName, {
      //   secretName: secretConfig.secretName,
      // });
      const secret = Secret.fromSecretNameV2(this, constSecretName, secretConfig.secretName);
      for (const [fieldName, envName] of Object.entries(secretConfig.envMapings)) {
        const ecsSecret = EcsSecret.fromSecretsManager(secret, fieldName);
        ecsSecret.grantRead(taskDefinition.obtainExecutionRole());
        secrets[envName] = ecsSecret;
      }
    }
    const dbEnv: ContainerDefinitionProps['environment'] = {};
    if (user) {
      dbEnv.DB_SSL = 'true';
      dbEnv.DB_PORT = '5432';
      dbEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    taskDefinition.addContainer('web', {
      image: ContainerImage.fromEcrRepository(repo, 'latest'),
      logging: new AwsLogDriver({
        logGroup: logGroup,
        streamPrefix: 'ecs',
      }),
      containerName: 'web',
      command: this.config.service.container.cmd,
      entryPoint: this.config.service.container.entrypoint ? [this.config.service.container.entrypoint] : undefined,
      portMappings: [
        {
          containerPort: this.config.service.container.port,
          hostPort: this.config.service.container.port,
        },
      ],
      secrets: {
        ...dbSecrets,
        ...secrets,
      },
      environment: {
        ...dbEnv,
        ...this.config.service.aws?.envVariables,
      },
    });

    const securityGroup = new SecurityGroup(this, 'SecuirtyGroupEcsService', {
      vpc: cluster.vpc,
      securityGroupName: `${this.config.service.name.toLocaleLowerCase()}-ecs-service`,
      description: 'Security group for docker container web',
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(this.config.service.container.port), 'HTTP acess');

    repo.grantPull(taskDefinition.obtainExecutionRole());

    const service = new FargateService(this, 'EcsService', {
      serviceName: this.config.service.name,
      cluster,
      taskDefinition,
      minHealthyPercent: 50,
      assignPublicIp: true,
      securityGroups: [securityGroup],
    });
    return service;
  }

  protected createS3Buckets(taskRole: IRole, bucketNames: string[]): void {
    for (const bucketName of bucketNames) {
      let bucket: Bucket;
      try {
      // Try to find an existing bucket in this account/region
        bucket = Bucket.fromBucketName(this, `ImportedBucket-${bucketName}`, bucketName) as Bucket;
      } catch {
      // If lookup fails, create a new bucket with unique suffix
        bucket = new Bucket(this, `CreatedBucket-${bucketName}`, {
          bucketName: `${bucketName}-${this.stackName}`,
          removalPolicy: RemovalPolicy.RETAIN,
        });
      }
    // Grant ECS task role read/write access
      bucket.grantReadWrite(taskRole);
      bucket.grantPutAcl(taskRole);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const bucketCnf = new CfnOutput(this, `BucketOutput-${bucketName}`, {
        value: bucket.bucketName,
        description: 'S3 bucket accessible by ECS task',
      });
    }
  }

  protected getBuildSpec(): BasePipelineProjectStrategy<string> {
    const map : Record<ServiceType, BasePipelineProjectStrategy<string>> = {
      [ServiceType.NodeJs]: new NodeJsPipelineProject(this),
      [ServiceType.PhpWebsite]: new PhpWebsitePipelineProject(this),
    };
    return map[this.config.service.type];
  }

  protected createSesConfiguration(taskRole: IRole, mailboxes: string[]): void {
    mailboxes.forEach((email) => {
      taskRole.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail',
          'ses:SendTemplatedEmail',
        ],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${email}`,
        ],
      }));
    });
  }
}
