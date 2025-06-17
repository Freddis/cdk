import {
  BuildEnvironmentVariableType,
  BuildSpec,
  LinuxBuildImage,
  PipelineProject,
  PipelineProjectProps,
} from 'aws-cdk-lib/aws-codebuild';
import {BuildSpecObject} from './BuildSpecObject';
import {Construct} from 'constructs';
import {LogGroup} from 'aws-cdk-lib/aws-logs';
import {DbUser} from './DbUser';
import {Stack} from 'aws-cdk-lib';
import {Repository} from 'aws-cdk-lib/aws-ecr';
import {BuildEnvVars} from './BuildEnvVars';
import {PipelineProjectCustomBuildEnvVars} from './PipelineProjectCustomBuildEnvVars';
import {PupelineProjectSecrets} from './PupelineProjectSecrets';


export abstract class BasePipelineProjectStrategy<T extends string> {

  protected abstract getSecrets(): PupelineProjectSecrets<T>
  protected abstract getPrebuildCmds(vars: BuildEnvVars<T>): string[];
  protected abstract getPostBuildCmds(vars: BuildEnvVars<T>): string[];
  protected abstract getBuildEnvs(): PipelineProjectCustomBuildEnvVars<T>
  protected construct: Construct;

  constructor(construct: Construct) {
    this.construct = construct;
  }

  public createProject(name: string, logGroup: LogGroup, repo: Repository, dbUser?: DbUser): PipelineProject {
    const dbEnv: PipelineProjectProps['environmentVariables'] = {};
    if (dbUser) {
      dbEnv.DB_USER = {
        value: dbUser.getUserNameSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_PASSWORD = {
        value: dbUser.getPasswordSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_DATABASE = {
        value: dbUser.getDatabaseSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_HOST = {
        value: dbUser.getHostSecretPath(),
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      };
      dbEnv.DB_PORT = {
        value: dbUser.getPort(),
      };
      dbEnv.DB_SSL = {
        value: 'true',
      };
      dbEnv.NODE_TLS_REJECT_UNAUTHORIZED = {
        value: '0',
      };
    }
    const project = new PipelineProject(this.construct, 'PipelineProjectDeploy', {
      buildSpec: BuildSpec.fromObject(this.getBuildSpecObject()),
      projectName: name,
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2023_5,
      },
      logging: {
        cloudWatch: {
          logGroup: logGroup,
        },
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: {value: Stack.of(this.construct).region},
        AWS_ACCOUNT_ID: {value: Stack.of(this.construct).account},
        ECR_REPO_URI: {value: repo.repositoryUri},
        ECR_REPO_NAME: {value: repo.repositoryName},
        TAG: {value: 'latest'},
        STAGE_NAME: {value: 'production'},
        ...dbEnv,
        ...this.getBuildEnvs(),
      },
    });
    const secrets = this.getSecrets();
    for (const secret in secrets) {
      if (Object.hasOwn(secrets, secret)) {
        secrets[secret].grantRead(project);
      }
    }
    dbUser?.getSecret().grantRead(project);
    repo.grantPullPush(project);
    return project;
  }

  protected getBuildSpecObject(): BuildSpecObject {
    // generating variable names
    const map = <T extends string>(
      obj: PipelineProjectCustomBuildEnvVars<T>
    ): {[key in keyof PipelineProjectCustomBuildEnvVars<T>]: `$${key}`} => {
      const res = Object.entries(obj).reduce((prev, curr) => {
        return {
          ...prev,
          [curr[0]]: curr[1],
        };
      }, {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res as any;
    };
    const vars : BuildEnvVars<T> = {
      AWS_DEFAULT_REGION: '$AWS_DEFAULT_REGION',
      AWS_ACCOUNT_ID: '$AWS_ACCOUNT_ID',
      ECR_REPO_URI: '$ECR_REPO_URI',
      ECR_REPO_NAME: '$ECR_REPO_NAME',
      TAG: '$TAG',
      STAGE_NAME: '$STAGE_NAME',
      DB_USER: '$DB_USER',
      DB_PASSWORD: '$DB_PASSWORD',
      DB_DATABASE: '$DB_DATABASE',
      DB_HOST: '$DB_HOST',
      DB_PORT: '$DB_PORT',
      DB_SSL: '$DB_SSL',
      ...map(this.getBuildEnvs()),
    };

    return this.createBuildSpecObject(vars);
  }

  protected createBuildSpecObject(v: BuildEnvVars<T>): BuildSpecObject {
    const spec: BuildSpecObject = {
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'echo "Authenticating Docker with ECR..."',
            // eslint-disable-next-line max-len
            `aws ecr get-login-password --region ${v.AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${v.AWS_ACCOUNT_ID}.dkr.ecr.${v.AWS_DEFAULT_REGION}.amazonaws.com`,
            'echo "ECR login successful."',
          ],
        },
        build: {
          commands: [
            'echo "Building Docker image..."',
            'pwd',
            'ls -al',
            ...this.getPrebuildCmds(v),
            `docker build -t ${v.ECR_REPO_URI}:${v.TAG} .`,
            ...this.getPostBuildCmds(v),
            'echo "Build successful."',
          ],
        },
        post_build: {
          commands: [
            'echo "Pushing Docker image to ECR..."',
            `docker push ${v.ECR_REPO_URI}:${v.TAG}`,
            `printf '[{"name":"web","imageUri":"%s"}]' ${v.ECR_REPO_URI}:${v.TAG} > imagedefinitions.json`,
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
    return spec;
  }

}
