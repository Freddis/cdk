import {BuildEnvironmentVariableType} from 'aws-cdk-lib/aws-codebuild';
import {BasePipelineProjectStrategy} from '../types/BasePipelineProjectStrategy';
import {ISecret, Secret} from 'aws-cdk-lib/aws-secretsmanager';
import {BuildEnvVars} from '../types/BuildEnvVars';
import {Construct} from 'constructs';

type PhpWebsiteEnvVarNames = 'GITHUB_TOKEN'
export class PhpWebsitePipelineProject extends BasePipelineProjectStrategy<PhpWebsiteEnvVarNames> {
  protected githubSecret: ISecret;

  constructor(construct: Construct) {
    super(construct);
    this.githubSecret = Secret.fromSecretNameV2(this.construct, 'GithubSecret', 'GithubAccessToken');
  }
  protected getSecrets(): {GITHUB_TOKEN: ISecret;} {
    return {
      GITHUB_TOKEN: this.githubSecret,
    };
  }

  protected getBuildEnvs() {
    const secret = this.getSecrets();
    const result = {
      GITHUB_TOKEN: {
        value: `${secret.GITHUB_TOKEN.secretName}:token`,
        type: BuildEnvironmentVariableType.SECRETS_MANAGER,
      },
    };
    return result;
  }

  protected getPrebuildCmds(v: BuildEnvVars<PhpWebsiteEnvVarNames>): string[] {
    return [
      `git config --global url."https://${v.GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"`,
      'git submodule update --init --recursive --force',
    ];
  }
  protected getPostBuildCmds(): string[] {
    return [];
  }

}
