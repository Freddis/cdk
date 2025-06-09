import {App, Duration, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {ApplicationStackProps} from './types/ApplicationStackProps';
import {Certificate, CertificateValidation} from 'aws-cdk-lib/aws-certificatemanager';
import {BuildSpec, PipelineProject, LinuxBuildImage} from 'aws-cdk-lib/aws-codebuild';
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
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  SslPolicy,
  ApplicationProtocol,
  ApplicationListener,
  ListenerAction,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {LogGroup, RetentionDays} from 'aws-cdk-lib/aws-logs';
import {HostedZone, IHostedZone, ARecord, RecordTarget} from 'aws-cdk-lib/aws-route53';
import {LoadBalancerTarget} from 'aws-cdk-lib/aws-route53-targets';
import {resolve} from 'path';

export class ApplicationStack extends Stack {
  protected config: ApplicationStackProps;

  constructor(scope: App, config: ApplicationStackProps) {
    super(scope, config.service.name, {
      env: config.aws,
      description: `Application stack for: ${config.service.name} `,
    });
    this.config = config;
    const repo = new Repository(this, 'ContainerRepository', {
      repositoryName: this.config.service.name.toLocaleLowerCase(),
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    const cluster = config.infrastructureStack.getEcsCluster();
    const loadBalancer = config.infrastructureStack.getLoadBalancer();
    const ecsService = this.createEcsService(repo, cluster);
    this.createCodePilene(repo, ecsService);
    this.attachDomainsToTask(ecsService, loadBalancer);
  }

  protected attachDomainsToTask(ecsService: FargateService, loadBalancer: ApplicationLoadBalancer) {
    for (const domainConfig of this.config.service.domains) {
      const hostedZone = HostedZone.fromLookup(this, `HostedZone_${domainConfig.domain}`, {
        domainName: domainConfig.domain,
      });
      this.attachDomainToTask(ecsService, loadBalancer, hostedZone, domainConfig.subdomain);
    }
  }

  protected attachDomainToTask(
    ecsService: FargateService,
    loadBalancer: ApplicationLoadBalancer,
    hostedZone: IHostedZone,
    subdomain?: string
  ) {
    const extraDomains = [
      `*.${hostedZone.zoneName}`,
    ];
    if (subdomain) {
      extraDomains.push(`*.${subdomain}.${hostedZone.zoneName}`,);
    }
    const sert = new Certificate(this, 'SslCertificate', {
      domainName: `${hostedZone.zoneName}`,
      subjectAlternativeNames: extraDomains,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    const httpsListener = new ApplicationListener(this, 'LoadBalancerListenerHttps', {
      loadBalancer: loadBalancer,
      certificates: [sert],
      port: 443,
      sslPolicy: SslPolicy.RECOMMENDED,
    });
    httpsListener.addTargets('LoadBalancerListenerTargets', {
      port: this.config.service.container.port,
      protocol: ApplicationProtocol.HTTP,
      targets: [ecsService],
      targetGroupName: this.config.service.name,
      healthCheck: {
        path: '/',
        port: `${this.config.service.container.port}`, // not sure if it was actually needed or last deployment had a bug on AWS.
      },
    });
    const httpListener = new ApplicationListener(this, 'LoadBalancerListenerHttp', {
      loadBalancer: loadBalancer,
      port: 80,
    });
    const action = ListenerAction.redirect({
      port: '443',
    });
    httpListener.addAction('HTTPS Redirect', {
      action,
    });
    const dnsArecord = new ARecord(this, 'DomainARecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: RecordTarget.fromAlias(
          new LoadBalancerTarget(loadBalancer)
        ),
    });
    return dnsArecord;
  }

  protected createCodePilene(repo: Repository, ecsService: FargateService) {
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
    const spec = BuildSpec.fromAsset(resolve(__dirname, './buildspecs//buildspec.yaml'));
    const logGroup = new LogGroup(this, 'LogGroupBuild', {
      retention: RetentionDays.ONE_DAY,
      logGroupName: `${this.config.service.name.toLocaleLowerCase()}-build`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
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
      },
    });
    repo.grantPullPush(project);
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

  protected createEcsService(repo: Repository, cluster: ICluster): FargateService {
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
      desiredCount: 1,
    });

    return service;
  }

}
