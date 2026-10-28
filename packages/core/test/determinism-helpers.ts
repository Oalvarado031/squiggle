export { EXAMPLES, SEEDS, PROMPT_PIECES, Interp, hashOps, postLength, POST_LIMIT } from '../src/index.ts';
import { COMMANDS, FUNCTIONS } from '../src/index.ts';

/** every command and function in the vocabulary has a runnable example */
export const VOCAB_CHECK = [...COMMANDS, ...FUNCTIONS].every((e) => e.example.length > 0);
