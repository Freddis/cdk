import {App, Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {ApplicationStackProps} from './types/ApplicationStackProps';
import {Certificate, CertificateValidation} from 'aws-cdk-lib/aws-certificatemanager';
import {BuildSpec, PipelineProject, LinuxBuildImage, BuildEnvironmentVariableType, PipelineProjectProps} from 'aws-cdk-lib/aws-codebuild';
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
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationProtocol,
  ApplicationListener,
  ListenerAction,
  ApplicationTargetGroup,
  ListenerCondition,
  ApplicationListenerRule,
  ApplicationListenerCertificate,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {HostedZone, IHostedZone, ARecord, RecordTarget} from 'aws-cdk-lib/aws-route53';
import {LoadBalancerTarget} from 'aws-cdk-lib/aws-route53-targets';
import {DbType} from './config/types/DbType';
import {DatabaseInstance} from 'aws-cdk-lib/aws-rds';
import {PostgresDbUser} from './constructs/PostgresDbUser/PostgresDbUser';
import {BuildSpecObject} from './types/BuildSpecObject';
import {DockerImageAsset, Platform} from 'aws-cdk-lib/aws-ecr-assets';
import {join} from 'path';
import {DockerImageName, ECRDeployment} from 'cdk-ecr-deployment';

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
    const db = config.infrastructureStack.getPostgresDb();
    const dbUser = this.createDbUser(db);
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

  protected createDbUser(db: DatabaseInstance): PostgresDbUser | undefined {
    if (this.config.service.database.type !== DbType.Postgres) {
      return undefined;
    }
    const dbUser = new PostgresDbUser(this, 'PostgresDbUser', {
      service: this.config.service.name,
      secretName: `${this.config.service.name}DbUser`,
      dbInstance: db,
      username: this.config.service.database.user,
      permissions: ['SELECT', 'INSERT', 'UPDATE'],
      database: this.config.service.database.database,
    });
    return dbUser;
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
    const rule = new ApplicationListenerRule(this, 'LoadBalancerListenerRule', {
      listener: httpsListener,
      priority: this.config.service.container.listenerPriority,
      conditions: [
        ListenerCondition.hostHeaders([
          `${subdomain}.${hostedZone.zoneName}`,
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

  protected createCodePilene(repo: Repository, ecsService: FargateService, user?: PostgresDbUser) {
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
        }),
      ],
    });

    const buildOutput = new Artifact();
    const spec = this.getBuildSpec();
    const logGroup = new LogGroup(this, 'LogGroupBuild', {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `${this.config.service.name.toLocaleLowerCase()}-build`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const dbEnv: PipelineProjectProps['environmentVariables'] = {};
    if (user) {
      dbEnv.DB_USER = {
        value: user.getUserNameSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_PASSWORD = {
        value: user.getPasswordSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_DATABASE = {
        value: user.getDatabaseSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_HOST = {
        value: user.getHostSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_PORT = {
        value: user.getPort(),
      };
      dbEnv.DB_SSL = {
        value: 'true',
      };
      dbEnv.NODE_TLS_REJECT_UNAUTHORIZED = {
        value: '0',
      };
    }
    const project = new PipelineProject(this, 'PipelineProjectDeploy', {
      buildSpec: spec,
      projectName: this.config.service.name,
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2023_5,
      },
      logging: {
        cloudWatch: {
          logGroup: logGroup,
        },
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: {value: Stack.of(this).region},
        AWS_ACCOUNT_ID: {value: Stack.of(this).account},
        ECR_REPO_URI: {value: repo.repositoryUri},
        ECR_REPO_NAME: {value: repo.repositoryName},
        TAG: {value: 'latest'},
        STAGE_NAME: {value: 'production'},
        ...dbEnv,
      },
    });
    repo.grantPullPush(project);
    user?.getSecret().grantRead(project);
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

  protected createEcsService(repo: Repository, cluster: ICluster, user?: PostgresDbUser): FargateService {
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

    const dbSecrets: ContainerDefinitionProps['secrets'] = {};
    if (user) {
      dbSecrets.DB_HOST = user.getHostEcsSecret();
      dbSecrets.DB_USER = user.getUserNameEcsSecret();
      dbSecrets.DB_PASSWORD = user.getPasswordEcsSecret();
      dbSecrets.DB_DATABASE = user.getDatabaseEcsSecret();
    }
    taskDefinition.addContainer('web', {
      image: ContainerImage.fromEcrRepository(repo, 'latest'),
      logging: new AwsLogDriver({
        logGroup: logGroup,
        streamPrefix: 'ecs',
      }),
      containerName: 'web',
      command: this.config.service.container.cmd,
      entryPoint: [this.config.service.container.entrypoint],
      portMappings: [
        {
          containerPort: this.config.service.container.port,
          hostPort: this.config.service.container.port,
        },
      ],
      secrets: {
        ...dbSecrets,
      },
      environment: {
        DB_SSL: 'true',
        DB_PORT: '5432',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
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
      minHealthyPercent: 100,
      assignPublicIp: true,
      securityGroups: [securityGroup],
    });
    return service;
  }

  protected getBuildSpec(): BuildSpec {

    const spec: BuildSpecObject = {
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'echo "Authenticating Docker with ECR..."',
            // eslint-disable-next-line max-len
            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            'echo "ECR login successful."',
          ],
        },
        build: {
          commands: [
            'echo "Building Docker image..."',
            'pwd',
            'ls -al',
            'npm install',
            'npm run db:migrate',
            'docker build -t ${ECR_REPO_URI}:${TAG} .',
            'echo "Build successful."',
          ],
        },
        post_build: {
          commands: [
            'echo "Pushing Docker image to ECR..."',
            'docker push ${ECR_REPO_URI}:${TAG}',
            "printf '[{\"name\":\"web\",\"imageUri\":\"%s\"}]' ${ECR_REPO_URI}:${TAG} > imagedefinitions.json",
            'ls -al',
            'cat imagedefinitions.json',
            'echo "Image pushed successfully."',
          ],
        },
      },
      artifacts: {
        files: [
          'imagedefinitions.json',
        ],
      },
    };
    const result = BuildSpec.fromObject(spec);
    return result;
  }

}
