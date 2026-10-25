// Hide statically built seed media when a profile is archived or permanently deleted.
import { handleSeedMediaRequest } from '../../../worker/src/index.mjs';

export function onRequest(context) {
  return handleSeedMediaRequest(context);
}
