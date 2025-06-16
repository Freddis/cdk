import {DatabaseInstance} from 'aws-cdk-lib/aws-rds';

export interface DatabaseUserProps {
  service: string,
  dbInstance: DatabaseInstance;
  secretName: string,
  username: string;
  database: string;
}
