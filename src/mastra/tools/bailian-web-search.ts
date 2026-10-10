/** The Responses adapter serializes this ID as Bailian's { type: 'web_search' }.
 * Execution is handled by Bailian; there is no local execute function.
 */
export const bailianWebSearchTool = {
  type: 'provider-defined' as const,
  id: 'openai.web_search' as const,
  name: 'web_search',
  description: 'Search the web through Bailian for current information.',
  args: {},
};
