import {DatabaseInstance} from 'aws-cdk-lib/aws-rds';

export interface DatabaseUserProps {
  dbInstance: DatabaseInstance;
  secretName: string,
  username: string;
  permissions: string[];
  database: string;
}
