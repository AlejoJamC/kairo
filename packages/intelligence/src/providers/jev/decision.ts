import { GatewayDecisionProvider } from '../gateway/decision';

/** Compatibility entry point for existing JEV shadow and canary services. */
export class JevDecisionProvider extends GatewayDecisionProvider {
  override readonly provider = 'jev';
}
