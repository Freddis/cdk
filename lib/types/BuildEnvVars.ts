
export enum BuildSpecEnvVariable {
  AWS_DEFAULT_REGION = 'AWS_DEFAULT_REGION',
  AWS_ACCOUNT_ID = 'AWS_ACCOUNT_ID',
  ECR_REPO_URI = 'ECR_REPO_URI',
  ECR_REPO_NAME = 'ECR_REPO_NAME',
  TAG = 'TAG',
  STAGE_NAME= 'STAGE_NAME',
}
export enum BuildSpecDbEnvVariables {
  DB_USER = 'DB_USER',
  DB_PASSWORD = 'DB_PASSWORD',
  DB_DATABASE = 'DB_DATABASE',
  DB_HOST = 'DB_HOST',
  DB_PORT ='DB_PORT',
  DB_SSL = 'DB_SSL',
}

type BuildSpecCustomEnvVariables<T extends string> = {
  [key in T]: `$${key}`
}
type KnownBuildVariableNames = keyof typeof BuildSpecEnvVariable| keyof typeof BuildSpecDbEnvVariables

type KnownBuildEnvVars = {
  [key in KnownBuildVariableNames]: `$${key}`
}
export type BuildEnvVars<T extends string> = KnownBuildEnvVars & BuildSpecCustomEnvVariables<T>
