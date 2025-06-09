import {HostedZoneValue} from './HostedZoneValue';

export interface DomainConfig {
   domain: HostedZoneValue,
   subdomain?: string,
}
