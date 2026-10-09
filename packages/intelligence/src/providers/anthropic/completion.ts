import { GatewayCompletionProvider } from '../gateway/completion';
import { ANTHROPIC_COMPLETION_MODEL } from '../../config/constants';

/** Compatibility alias; the key is an AI Gateway key. */
export class AnthropicCompletionProvider extends GatewayCompletionProvider {
  constructor(apiKey: string, model: string = ANTHROPIC_COMPLETION_MODEL) {
    super(apiKey, model.includes('/') ? model : `anthropic/${model}`);
  }
}
