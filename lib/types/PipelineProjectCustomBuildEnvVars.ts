import {BuildEnvironmentVariable} from 'aws-cdk-lib/aws-codebuild';

export type PipelineProjectCustomBuildEnvVars<T extends string> = {
  [key in T]: BuildEnvironmentVariable
}
