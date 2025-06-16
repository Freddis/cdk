import {DatabaseInstance} from 'aws-cdk-lib/aws-rds';

export interface DatabaseUserProps {
  service: string,
  dbInstance: DatabaseInstance;
  secretName: string,
  username: string;
  permissions: string[];
  database: string;
}
