/**
 * The one AI Gateway model string, shared by Cabala and the second read. It is read when the agent
 * is built, so set BOOKRUNNER_MODEL in the build environment to change it.
 */
export const MODEL = process.env.BOOKRUNNER_MODEL || "anthropic/claude-opus-5.5";
