export interface BuildSpecObject {
  version: '0.2';
  phases: {
    pre_build?: {
      commands: string[];
    };
    build: {
      commands: string[];
    };
    post_build?: {
      commands: string[];
    };
  };
  artifacts?: {
    files: string[];
  };
  env?: {
    'exported-variables'?: string[];
    'git-credential-helper'?: 'yes' | 'no'
  };
}
