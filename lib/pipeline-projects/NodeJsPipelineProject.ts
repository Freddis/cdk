import {BasePipelineProjectStrategy} from '../types/BasePipelineProjectStrategy';

export class NodeJsPipelineProject extends BasePipelineProjectStrategy<never> {
  protected getPrebuildCmds(): string[] {
    return [];
  }
  protected getBuildEnvs() {
    return {};
  }
  protected getSecrets() {
    return {};
  }
  protected Cmds(): string[] {
    return [];
  }

  protected getPostBuildCmds(): string[] {
    return [
      'npm install',
      'npm run db:migrate',
    ];
  }
}
