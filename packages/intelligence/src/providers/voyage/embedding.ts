import { GatewayEmbeddingProvider } from '../gateway/embedding';
import { VOYAGE_EMBEDDING_MODEL, VOYAGE_EMBEDDING_DIMENSIONS } from '../../config/constants';

/** Compatibility alias; the key is an AI Gateway key. */
export class VoyageEmbeddingProvider extends GatewayEmbeddingProvider {
  constructor(apiKey: string) {
    super(apiKey, `voyage/${VOYAGE_EMBEDDING_MODEL}`, VOYAGE_EMBEDDING_DIMENSIONS);
  }
}
